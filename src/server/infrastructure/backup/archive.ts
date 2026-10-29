import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import tar from 'tar-stream';
import type pg from 'pg';
import { conflict, invalid, notFound } from '@/domain/errors';
import type { BackupInfo, BackupKind, BackupStore } from '@/server/application/ports';
import { migrate } from '../db/schema';

/**
 * Cadangan lengkap dalam satu file .tar.gz:
 *   manifest.json     ringkasan (versi format, waktu, jumlah baris per tabel, jumlah file)
 *   db/<tabel>.json   isi tabel sebagai JSON dari Postgres sendiri (json_agg), jadi tipe kembali utuh
 *   files/<path>      semua file lampiran dan template, dengan path yang sama seperti di penyimpanan
 * Tabel sesi tidak ikut: setelah pemulihan semua pengguna masuk lagi.
 * Di samping setiap arsip ada <nama>.json berisi manifest agar daftar cadangan tidak perlu membuka arsip.
 */

const FORMAT = 1;
const APP = 'surat-web-app';
const SKIP_TABLES = new Set(['sessions']);
const NAME = /^cadangan-\d{8}-\d{6}-[a-z-]+\.tar\.gz$/;
const ENTRY_DB = /^db\/([a-z_][a-z0-9_]*)\.json$/;
const ENTRY_FILE = /^files\/((?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+)$/;

interface Manifest { app: string; format: number; dibuat: string; jenis: BackupKind; label: string; tabel: Record<string, number>; file: number; ukuran_file: number }

const ident = (t: string) => `"${t.replace(/"/g, '""')}"`;
const stampOf = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

async function* walk(root: string, rel = ''): AsyncGenerator<{ rel: string; abs: string; size: number }> {
  let entries: fs.Dirent[];
  try { entries = await fsp.readdir(path.join(root, rel), { withFileTypes: true }); } catch { return; }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) yield* walk(root, r);
    else if (e.isFile() && ENTRY_FILE.test(`files/${r}`)) yield { rel: r, abs: path.join(root, r), size: (await fsp.stat(path.join(root, r))).size };
  }
}

/** Tabel di skema public, diurutkan agar tabel induk (yang dirujuk foreign key) datang lebih dulu. */
async function tablesInOrder(db: pg.Pool | pg.PoolClient) {
  const tables = (await db.query<{ t: string }>(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1`)).rows.map((r) => r.t);
  const deps = (await db.query<{ child: string; parent: string }>(`
    SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
    FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.contype = 'f' AND n.nspname = 'public' AND c.conrelid <> c.confrelid`)).rows;
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (t: string, stack: Set<string>) => {
    if (seen.has(t) || stack.has(t)) return;
    stack.add(t);
    for (const d of deps) if (d.child === t) visit(d.parent, stack);
    seen.add(t);
    order.push(t);
  };
  for (const t of tables) visit(t, new Set());
  return order;
}

async function primaryKey(db: pg.PoolClient, table: string) {
  return (await db.query<{ a: string }>(`
    SELECT a.attname AS a FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = $1::regclass AND i.indisprimary ORDER BY array_position(i.indkey, a.attnum)`, [table])).rows.map((r) => r.a);
}

const writeEntry = (pack: tar.Pack, name: string, body: Buffer) =>
  new Promise<void>((resolve, reject) => pack.entry({ name, size: body.length, mtime: new Date() }, body, (e) => (e ? reject(e) : resolve())));

const streamEntry = (pack: tar.Pack, name: string, abs: string, size: number) =>
  new Promise<void>((resolve, reject) => {
    const entry = pack.entry({ name, size, mtime: new Date() }, (e) => (e ? reject(e) : resolve()));
    const src = fs.createReadStream(abs);
    src.on('error', reject);
    src.pipe(entry);
  });

/** Baca arsip, panggil onEntry untuk setiap entri. Entri yang tidak dikenal dilewati. */
async function readArchive(file: string, onEntry: (name: string, stream: NodeJS.ReadableStream, size: number) => Promise<void>) {
  const extract = tar.extract();
  const done = new Promise<void>((resolve, reject) => {
    extract.on('entry', (header, stream, next) => {
      const name = header.name.replace(/^\.\//, '');
      const skip = () => { stream.on('end', () => next()); stream.resume(); };
      if (header.type !== 'file' || name.includes('..') || name.startsWith('/')) return skip();
      onEntry(name, stream as unknown as Readable, header.size ?? 0).then(() => next(), (e) => { stream.resume(); reject(e); });
    });
    extract.on('finish', resolve);
    extract.on('error', reject);
  });
  try {
    await Promise.all([pipeline(fs.createReadStream(file), zlib.createGunzip(), extract), done]);
  } catch (e) {
    if ((e as { code?: string }).code === 'Z_DATA_ERROR' || /header|gzip|incorrect/i.test((e as Error).message)) throw invalid('File bukan arsip cadangan yang valid (.tar.gz)');
    throw e;
  }
}

const collect = async (stream: NodeJS.ReadableStream) => {
  const parts: Buffer[] = [];
  for await (const c of stream) parts.push(c as Buffer);
  return Buffer.concat(parts);
};

const drain = async (stream: NodeJS.ReadableStream) => { for await (const _ of stream) void _; };

function checkManifest(m: Partial<Manifest> | null): Manifest {
  if (!m || m.app !== APP) throw invalid('File ini bukan cadangan Sistem Surat');
  if (m.format !== FORMAT) throw invalid(`Versi format cadangan (${m.format}) tidak didukung aplikasi ini`);
  return m as Manifest;
}

export function archiveBackups(pool: pg.Pool, opts: { storageDir: string; backupDir: string; maxBytes: number }): BackupStore {
  const dir = path.resolve(opts.backupDir);
  const storage = path.resolve(opts.storageDir);
  let busy: string | null = null;

  const abs = (nama: string) => {
    if (!NAME.test(nama)) throw notFound('Cadangan tidak ditemukan');
    return path.join(dir, nama);
  };
  const exclusive = async <T>(what: string, fn: () => Promise<T>) => {
    if (busy) throw conflict(`Sedang ada proses ${busy}. Tunggu sampai selesai`);
    busy = what;
    // Kunci advisory agar proses lain (mis. replika kedua) tidak mencadangkan atau memulihkan bersamaan.
    const lock = await pool.connect();
    try {
      const ok = (await lock.query<{ ok: boolean }>('SELECT pg_try_advisory_lock(727002) AS ok')).rows[0].ok;
      if (!ok) throw conflict('Sedang ada proses cadangan atau pemulihan di server lain');
      try { return await fn(); } finally { await lock.query('SELECT pg_advisory_unlock(727002)').catch(() => {}); }
    } finally {
      lock.release();
      busy = null;
    }
  };
  const toInfo = (nama: string, m: Manifest, ukuran: number): BackupInfo =>
    ({ nama, dibuat: m.dibuat, jenis: m.jenis, label: m.label, tabel: m.tabel, file: m.file, ukuran });
  const writeSidecar = (nama: string, m: Manifest) => fsp.writeFile(path.join(dir, `${nama}.json`), JSON.stringify(m));
  const finalName = async (jenis: BackupKind, when = new Date()) => {
    for (let i = 0; ; i++) {
      const nama = `cadangan-${stampOf(new Date(when.getTime() + i * 1000))}-${jenis}.tar.gz`;
      if (!fs.existsSync(path.join(dir, nama))) return nama;
    }
  };

  async function create(jenis: BackupKind, label: string) {
    await fsp.mkdir(dir, { recursive: true });
    const nama = await finalName(jenis);
    const part = path.join(dir, `.${nama}.part`);
    const pack = tar.pack();
    const written = pipeline(pack, zlib.createGzip({ level: 6 }), fs.createWriteStream(part));
    const client = await pool.connect();
    const m: Manifest = { app: APP, format: FORMAT, dibuat: new Date().toISOString(), jenis, label, tabel: {}, file: 0, ukuran_file: 0 };
    try {
      // Satu snapshot untuk semua tabel: data yang tersimpan saling cocok walau ada yang menulis saat pencadangan.
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      for (const t of await tablesInOrder(client)) {
        if (SKIP_TABLES.has(t)) continue;
        const pk = await primaryKey(client, t);
        const order = pk.length ? ` ORDER BY ${pk.map((c) => `x.${ident(c)}`).join(', ')}` : '';
        const row = (await client.query<{ j: string; n: number }>(`SELECT coalesce(json_agg(x${order}), '[]')::text AS j, count(*)::int AS n FROM ${ident(t)} x`)).rows[0];
        m.tabel[t] = row.n;
        await writeEntry(pack, `db/${t}.json`, Buffer.from(row.j));
      }
      await client.query('COMMIT');
      for await (const f of walk(storage)) {
        await streamEntry(pack, `files/${f.rel}`, f.abs, f.size);
        m.file++;
        m.ukuran_file += f.size;
      }
      await writeEntry(pack, 'manifest.json', Buffer.from(JSON.stringify(m, null, 2)));
      pack.finalize();
      await written;
      await fsp.rename(part, path.join(dir, nama));
      await writeSidecar(nama, m);
      return toInfo(nama, m, (await fsp.stat(path.join(dir, nama))).size);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      pack.destroy();
      await written.catch(() => {});
      await fsp.rm(part, { force: true });
      throw e;
    } finally {
      client.release();
    }
  }

  async function readManifest(file: string) {
    let m: Partial<Manifest> | null = null;
    await readArchive(file, async (name, stream) => {
      if (name !== 'manifest.json') return drain(stream);
      try { m = JSON.parse((await collect(stream)).toString('utf8')); } catch { m = null; }
    });
    return checkManifest(m);
  }

  async function restore(nama: string) {
    const file = abs(nama);
    if (!fs.existsSync(file)) throw notFound('Cadangan tidak ditemukan');
    const work = `${storage}.pulih-${Date.now()}`;
    await fsp.mkdir(path.join(work, 'files'), { recursive: true });
    await fsp.mkdir(path.join(work, 'db'), { recursive: true });
    try {
      // 1. Bongkar ke folder sementara di samping penyimpanan (satu disk, jadi penukaran folder seketika).
      let manifest: Partial<Manifest> | null = null;
      await readArchive(file, async (name, stream) => {
        const dbm = ENTRY_DB.exec(name);
        const fm = ENTRY_FILE.exec(name);
        if (name === 'manifest.json') manifest = JSON.parse((await collect(stream)).toString('utf8'));
        else if (dbm) await pipeline(stream as Readable, fs.createWriteStream(path.join(work, 'db', `${dbm[1]}.json`)));
        else if (fm) {
          const target = path.join(work, 'files', fm[1]);
          if (!target.startsWith(path.join(work, 'files') + path.sep)) return drain(stream);
          await fsp.mkdir(path.dirname(target), { recursive: true });
          await pipeline(stream as Readable, fs.createWriteStream(target));
        } else await drain(stream);
      });
      const m = checkManifest(manifest);

      // 2. Ganti isi database dalam satu transaksi: gagal di tengah berarti tidak ada yang berubah.
      const client = await pool.connect();
      const counts: Record<string, number> = {};
      try {
        await client.query('BEGIN');
        const tables = await tablesInOrder(client);
        await client.query(`TRUNCATE ${tables.map(ident).join(', ')} RESTART IDENTITY CASCADE`);
        for (const t of tables) {
          const src = path.join(work, 'db', `${t}.json`);
          if (SKIP_TABLES.has(t) || !fs.existsSync(src)) continue;
          const rows = JSON.parse(await fsp.readFile(src, 'utf8')) as Record<string, unknown>[];
          if (!rows.length) { counts[t] = 0; continue; }
          const current = new Set((await client.query<{ c: string }>(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND is_generated='NEVER'`, [t])).rows.map((r) => r.c));
          // Hanya kolom yang ada di kedua sisi: cadangan dari versi lama tetap dapat dipulihkan, kolom baru memakai nilai bawaan.
          const cols = Object.keys(rows[0]).filter((c) => current.has(c));
          const list = cols.map(ident).join(', ');
          for (let i = 0; i < rows.length; i += 500) {
            const chunk = rows.slice(i, i + 500).map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
            await client.query(`INSERT INTO ${ident(t)} (${list}) SELECT ${list} FROM json_populate_recordset(NULL::${ident(t)}, $1::json)`, [JSON.stringify(chunk)]);
          }
          counts[t] = rows.length;
        }
        // Lanjutkan nomor urut ID dari nilai terbesar yang dipulihkan.
        const serials = (await client.query<{ t: string; c: string; s: string }>(`
          SELECT table_name AS t, column_name AS c, pg_get_serial_sequence(quote_ident(table_name), column_name) AS s
          FROM information_schema.columns WHERE table_schema='public' AND column_default LIKE 'nextval(%'`)).rows;
        for (const s of serials) {
          if (s.s) await client.query(`SELECT setval($1, coalesce((SELECT max(${ident(s.c)}) FROM ${ident(s.t)}), 1), (SELECT max(${ident(s.c)}) FROM ${ident(s.t)}) IS NOT NULL)`, [s.s]);
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
      // Skema dan data bawaan disesuaikan lagi dengan versi aplikasi ini (aman dijalankan berulang).
      await migrate(pool);

      // 3. Tukar folder file. Folder lama dihapus setelah folder baru terpasang.
      const old = `${storage}.lama-${Date.now()}`;
      if (fs.existsSync(storage)) await fsp.rename(storage, old);
      await fsp.rename(path.join(work, 'files'), storage);
      await fsp.rm(old, { recursive: true, force: true });
      return { tabel: counts, file: m.file, dibuat: m.dibuat };
    } finally {
      await fsp.rm(work, { recursive: true, force: true });
    }
  }

  return {
    async list() {
      let names: string[] = [];
      try { names = (await fsp.readdir(dir)).filter((n) => NAME.test(n)); } catch { return []; }
      const out: BackupInfo[] = [];
      for (const n of names) {
        const st = await fsp.stat(path.join(dir, n)).catch(() => null);
        if (!st) continue;
        let m: Manifest | null = null;
        try { m = JSON.parse(await fsp.readFile(path.join(dir, `${n}.json`), 'utf8')); } catch {
          try { m = await readManifest(path.join(dir, n)); await writeSidecar(n, m); } catch { m = null; }
        }
        if (m) out.push(toInfo(n, m, st.size));
      }
      return out.sort((a, b) => b.nama.localeCompare(a.nama));
    },
    async info(nama) {
      return (await this.list()).find((b) => b.nama === nama) ?? null;
    },
    path(nama) {
      const p = abs(nama);
      if (!fs.existsSync(p)) throw notFound('Cadangan tidak ditemukan');
      return p;
    },
    create: (jenis, label = '') => exclusive('pencadangan', () => create(jenis, label)),
    restore: (nama) => exclusive('pemulihan', () => restore(nama)),
    async remove(nama) {
      const p = abs(nama);
      await fsp.rm(p, { force: true });
      await fsp.rm(`${p}.json`, { force: true });
    },
    async prune(jenis, keep) {
      const list = (await this.list()).filter((b) => b.jenis === jenis);
      for (const b of list.slice(Math.max(keep, 1))) await this.remove(b.nama);
    },
    /** Terima arsip dari luar (unggahan atau Google Drive): disimpan sementara, diperiksa, lalu diberi nama baku. */
    async receive(source, jenis) {
      await fsp.mkdir(dir, { recursive: true });
      const part = path.join(dir, `.terima-${Date.now()}.part`);
      let size = 0;
      const limit = opts.maxBytes;
      try {
        await pipeline(
          source as AsyncIterable<Uint8Array>,
          async function* (chunks: AsyncIterable<Uint8Array>) {
            for await (const c of chunks) {
              size += c.length;
              if (size > limit) throw invalid(`File cadangan terlalu besar (maks ${Math.round(limit / 1048576)} MB)`);
              yield c;
            }
          },
          fs.createWriteStream(part),
        );
        if (!size) throw invalid('File cadangan kosong');
        const m = await readManifest(part);
        const nama = await finalName(jenis);
        await fsp.rename(part, path.join(dir, nama));
        await writeSidecar(nama, { ...m, jenis, label: m.label || `Dari cadangan ${m.dibuat.slice(0, 10)}` });
        return toInfo(nama, { ...m, jenis }, size);
      } finally {
        await fsp.rm(part, { force: true });
      }
    },
    busy: () => busy,
  };
}
