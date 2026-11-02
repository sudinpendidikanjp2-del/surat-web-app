import { conflict, forbidden, invalid, isAppError } from '@/domain/errors';
import { can, type Actor } from '@/domain/roles';
import { oneOf, str } from '@/domain/validation';
import { auditFor, type Ctx, type Deps } from './context';
import type { DrivePending, GoogleAuth, SheetTable } from './ports';
import * as lettersIn from './letters-in';
import * as lettersOut from './letters-out';
import * as tasks from './tasks';
import { exportInstansi } from './reference';

type Body = Record<string, unknown>;

/**
 * Integrasi Google: arsip lampiran ke Google Drive (folder per jenis, tahun, bulan, dan surat) dan rekap tabel ke
 * Google Spreadsheet. Dua cara terhubung: akun Google biasa (OAuth, cocok untuk Gmail kantor) atau akun layanan
 * (Google Workspace / Shared Drive). Rahasia tidak pernah dikirim kembali ke peramban.
 */
export interface GoogleSettings {
  mode: 'oauth' | 'service' | null;
  client_id?: string; client_secret?: string; refresh_token?: string; email?: string | null;
  service_email?: string; service_key?: string;
  folder_id?: string | null; spreadsheet_id?: string | null;
  sinkron_otomatis?: boolean; sinkron_tiap_jam?: number;
  terhubung_pada?: string | null;
}
export interface GoogleRunStatus {
  berjalan: boolean; mulai: string | null; selesai: string | null; galat: string | null;
  hasil: { file_baru: number; file_gagal: number; file_sisa: number; lembar: number; baris: number } | null;
}

export const ROOT_FOLDER = 'Sistem Surat';
export const DRIVE_FOLDERS = { masuk: 'Surat Masuk', keluar: 'Surat Keluar', cadangan: 'Cadangan' } as const;
const SYNC_BATCH = 300;
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const INTERVALS = [1, 3, 6, 12, 24];

const requireAdmin = (ctx: Ctx) => { if (!can.admin(ctx.actor)) throw forbidden(); };
export const loadGoogle = async (d: Deps) => (await d.uow.read.settings.get<GoogleSettings>('google')) || { mode: null };
const loadStatus = async (d: Deps) =>
  (await d.uow.read.settings.get<GoogleRunStatus>('google_status')) || { berjalan: false, mulai: null, selesai: null, galat: null, hasil: null };

/** Kredensial siap pakai, atau null bila belum lengkap. */
export function authOf(g: GoogleSettings): GoogleAuth | null {
  if (g.mode === 'service' && g.service_email && g.service_key) return { mode: 'service', client_email: g.service_email, private_key: g.service_key };
  if (g.mode === 'oauth' && g.client_id && g.client_secret && g.refresh_token) return { mode: 'oauth', client_id: g.client_id, client_secret: g.client_secret, refresh_token: g.refresh_token };
  return null;
}
const needAuth = (g: GoogleSettings) => {
  const a = authOf(g);
  if (!a) throw invalid('Google belum terhubung. Lengkapi pengaturan di halaman Google Drive & Spreadsheet');
  return a;
};

/** Ambil ID dari tautan Google Drive/Sheets yang ditempel admin, atau ID itu sendiri. */
export function idFromLink(v: unknown, name: string) {
  const s = str(v, name, { max: 300, required: false });
  if (!s) return null;
  const m = /\/(?:folders|d)\/([A-Za-z0-9_-]{10,})/.exec(s) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(s) || /^([A-Za-z0-9_-]{10,})$/.exec(s.trim());
  if (!m) throw invalid(`${name} tidak dikenali. Tempel tautan dari Google Drive/Sheets atau ID-nya`);
  return m[1];
}

const redirectUri = (baseUrl: string) => `${baseUrl}/api/google/callback`;

export async function status(d: Deps, ctx: Ctx) {
  requireAdmin(ctx);
  const g = await loadGoogle(d);
  const counts = await d.uow.read.attachments.driveCounts();
  return {
    mode: g.mode,
    terhubung: !!authOf(g),
    email: g.mode === 'service' ? g.service_email ?? null : g.email ?? null,
    client_id: g.client_id ?? '',
    ada_client_secret: !!g.client_secret,
    ada_kunci_layanan: !!g.service_key,
    folder_id: g.folder_id ?? null,
    folder_url: g.folder_id ? `https://drive.google.com/drive/folders/${g.folder_id}` : null,
    spreadsheet_id: g.spreadsheet_id ?? null,
    spreadsheet_url: g.spreadsheet_id ? d.google.spreadsheetUrl(g.spreadsheet_id) : null,
    sinkron_otomatis: !!g.sinkron_otomatis,
    sinkron_tiap_jam: g.sinkron_tiap_jam ?? 24,
    terhubung_pada: g.terhubung_pada ?? null,
    redirect_uri: redirectUri(ctx.baseUrl),
    lampiran: counts,
    proses: await loadStatus(d),
  };
}

/** Simpan cara terhubung, folder, spreadsheet, dan jadwal. Rahasia yang dikosongkan berarti tetap memakai yang lama. */
export async function save(d: Deps, ctx: Ctx, b: Body) {
  requireAdmin(ctx);
  const cur = await loadGoogle(d);
  const mode = oneOf(b.mode, ['oauth', 'service'] as const, 'Cara terhubung');
  const next: GoogleSettings = { ...cur, mode };
  if (mode === 'service') {
    const raw = str(b.service_json, 'File kunci akun layanan', { max: 20000, required: false });
    if (raw) {
      let j: { type?: string; client_email?: string; private_key?: string };
      try { j = JSON.parse(raw); } catch { throw invalid('File kunci akun layanan bukan JSON yang valid'); }
      if (j.type !== 'service_account' || !j.client_email || !j.private_key) throw invalid('File JSON ini bukan kunci akun layanan. Unduh kunci jenis JSON dari Google Cloud > IAM > Akun layanan');
      next.service_email = j.client_email;
      next.service_key = j.private_key;
    }
    if (!next.service_key) throw invalid('Unggah file kunci akun layanan (JSON)');
  } else {
    const clientId = str(b.client_id, 'Client ID', { max: 300 });
    const secret = str(b.client_secret, 'Client Secret', { max: 300, required: false });
    if (clientId !== cur.client_id) { next.refresh_token = undefined; next.email = null; }
    next.client_id = clientId;
    if (secret) next.client_secret = secret;
    if (!next.client_secret) throw invalid('Client Secret wajib diisi');
  }
  const folder = idFromLink(b.folder, 'Folder Google Drive');
  const sheet = idFromLink(b.spreadsheet, 'Spreadsheet');
  const folderChanged = b.folder !== undefined && folder !== (cur.folder_id ?? null);
  if (b.folder !== undefined) next.folder_id = folder;
  if (b.spreadsheet !== undefined) next.spreadsheet_id = sheet;
  next.sinkron_otomatis = Boolean(b.sinkron_otomatis);
  next.sinkron_tiap_jam = INTERVALS.includes(Number(b.sinkron_tiap_jam)) ? Number(b.sinkron_tiap_jam) : 24;
  if (mode !== cur.mode) next.terhubung_pada = null;
  await d.uow.run(async (r) => {
    await r.settings.set('google', next);
    // Folder tujuan berganti: peta folder lama dilupakan dan semua lampiran diunggah ke folder baru.
    if (folderChanged) { await r.settings.set('google_folders', {}); await r.attachments.resetDrive(); }
    await auditFor(r, ctx, 'GOOGLE_DIATUR', 'setting', 'google', { mode, folder: next.folder_id ?? null, spreadsheet: next.spreadsheet_id ?? null, otomatis: next.sinkron_otomatis });
  });
  return status(d, ctx);
}

/** Alamat persetujuan Google untuk mode OAuth. state acak mencegah pemalsuan balasan. */
export async function connectUrl(d: Deps, ctx: Ctx) {
  requireAdmin(ctx);
  const g = await loadGoogle(d);
  if (g.mode !== 'oauth' || !g.client_id || !g.client_secret) throw invalid('Simpan Client ID dan Client Secret terlebih dahulu');
  const state = d.tokens.create(24);
  await d.uow.run((r) => r.settings.set('google_oauth_state', { hash: d.tokens.hash(state), at: Date.now(), user: ctx.actor.id }));
  return { url: d.google.authUrl(g.client_id, redirectUri(ctx.baseUrl), state) };
}

/** Balasan dari Google setelah admin menyetujui. Mengembalikan pesan untuk ditampilkan di halaman. */
export async function oauthCallback(d: Deps, ctx: Ctx, q: Record<string, string | undefined>) {
  requireAdmin(ctx);
  if (q.error) return { ok: false, pesan: q.error === 'access_denied' ? 'Persetujuan dibatalkan di halaman Google' : `Google menolak: ${q.error}` };
  const saved = await d.uow.read.settings.get<{ hash?: string; at?: number; user?: number }>('google_oauth_state');
  if (!saved?.hash || !saved.at || !q.state || saved.hash !== d.tokens.hash(q.state) || Date.now() - saved.at > 15 * 60_000 || saved.user !== ctx.actor.id) {
    return { ok: false, pesan: 'Tautan persetujuan sudah kedaluwarsa. Klik "Hubungkan akun Google" lagi' };
  }
  const g = await loadGoogle(d);
  try {
    const t = await d.google.exchangeCode(g.client_id!, g.client_secret!, String(q.code || ''), redirectUri(ctx.baseUrl));
    await d.uow.run(async (r) => {
      await r.settings.set('google', { ...g, refresh_token: t.refresh_token, email: t.email, terhubung_pada: new Date().toISOString() });
      await r.settings.set('google_oauth_state', {}); // dipakai sekali
      await auditFor(r, ctx, 'GOOGLE_TERHUBUNG', 'setting', 'google', { email: t.email });
    });
    return { ok: true, pesan: `Terhubung ke Google${t.email ? ` sebagai ${t.email}` : ''}` };
  } catch (e) {
    if (!isAppError(e)) console.error('Balasan OAuth Google gagal:', e);
    return { ok: false, pesan: isAppError(e) ? e.message : 'Gagal menghubungkan akun Google' };
  }
}

export async function disconnect(d: Deps, ctx: Ctx) {
  requireAdmin(ctx);
  const g = await loadGoogle(d);
  await d.uow.run(async (r) => {
    await r.settings.set('google', { ...g, refresh_token: undefined, email: null, service_key: undefined, service_email: undefined, terhubung_pada: null, sinkron_otomatis: false });
    await auditFor(r, ctx, 'GOOGLE_DIPUTUS', 'setting', 'google', {});
  });
  return status(d, ctx);
}

/* ---------- Folder ---------- */

/** Folder induk aplikasi: yang dipilih admin, atau "Sistem Surat" di Drive akun yang terhubung. */
async function rootFolder(d: Deps, g: GoogleSettings, a: GoogleAuth) {
  if (g.folder_id) return g.folder_id;
  if (a.mode === 'service') throw invalid('Akun layanan perlu folder tujuan di Shared Drive. Isi tautan folder lalu simpan');
  const id = await d.google.folder(a, ROOT_FOLDER, null);
  await d.uow.run((r) => r.settings.set('google', { ...g, folder_id: id }));
  g.folder_id = id;
  return id;
}

/** Folder bertingkat dengan peta jalur → ID yang disimpan, agar tidak mencari ulang ke Google setiap file. */
async function folderPath(d: Deps, a: GoogleAuth, root: string, parts: string[], cache: Record<string, string>) {
  let parent = root;
  let key = '';
  for (const p of parts) {
    key = key ? `${key}/${p}` : p;
    if (!cache[key]) cache[key] = await d.google.folder(a, p, parent);
    parent = cache[key];
  }
  return parent;
}

const clean = (s: string, max: number) => s.replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Jalur folder untuk satu lampiran: Surat Masuk/2026/10 Oktober/AG-0012 Perihal surat. */
export function driveFolderFor(p: Pick<DrivePending, 'arah' | 'tanggal' | 'no_agenda' | 'perihal'>) {
  const [y, m] = p.tanggal.split('-');
  return [DRIVE_FOLDERS[p.arah], y, `${m} ${BULAN[Number(m) - 1]}`, clean(`${p.no_agenda} ${p.perihal}`, 120)];
}

export async function backupFolder(d: Deps) {
  const g = await loadGoogle(d);
  const a = needAuth(g);
  const root = await rootFolder(d, g, a);
  const cache = (await d.uow.read.settings.get<Record<string, string>>('google_folders')) || {};
  const id = await folderPath(d, a, root, [DRIVE_FOLDERS.cadangan], cache);
  await d.uow.run((r) => r.settings.set('google_folders', cache));
  return { a, id };
}

/** Uji sambungan: kredensial, folder, dan spreadsheet dapat dipakai. */
export async function test(d: Deps, ctx: Ctx) {
  requireAdmin(ctx);
  const g = await loadGoogle(d);
  const a = needAuth(g);
  const email = await d.google.whoami(a);
  const root = await rootFolder(d, g, a);
  await d.google.list(a, root);
  return { ok: true, email, folder_url: `https://drive.google.com/drive/folders/${root}`, pesan: `Tersambung sebagai ${email}. Folder tujuan dapat dibuka.` };
}

/* ---------- Sinkronisasi ---------- */

/** Pelaku sistem untuk membaca seluruh data saat menyusun spreadsheet. */
const SYSTEM: Actor = { id: 0, username: 'sistem', nama: 'Sinkronisasi Google', role: 'superadmin', unit_id: null };

async function sheetTables(d: Deps): Promise<SheetTable[]> {
  const ctx: Ctx = { actor: SYSTEM, ip: 'sistem', baseUrl: '' };
  const [masuk, keluar, tugas, instansi] = await Promise.all([
    lettersIn.exportRows(d, ctx, {}), lettersOut.exportRows(d, ctx, {}), tasks.exportRows(d, ctx, {}), exportInstansi(d, ctx, {}),
  ]);
  const count = (rows: unknown[][], col: number) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(String(r[col] ?? '-'), (m.get(String(r[col] ?? '-')) || 0) + 1);
    return [...m.entries()].sort((x, y) => y[1] - x[1]);
  };
  const when = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: d.timezone });
  const ringkasan: unknown[][] = [
    ['Diperbarui', when, ''],
    ['Surat masuk', 'Jumlah', masuk.rows.length],
    ...count(masuk.rows, masuk.columns.indexOf('Status')).map(([k, v]) => ['Surat masuk', k, v]),
    ['Surat keluar', 'Jumlah', keluar.rows.length],
    ...count(keluar.rows, keluar.columns.indexOf('Status')).map(([k, v]) => ['Surat keluar', k, v]),
    ['Tugas', 'Jumlah', tugas.rows.length],
    ...count(tugas.rows, tugas.columns.indexOf('Status')).map(([k, v]) => ['Tugas', k, v]),
  ];
  return [
    { title: 'Ringkasan', columns: ['Bagian', 'Keterangan', 'Jumlah'], rows: ringkasan },
    { title: 'Surat Masuk', ...masuk },
    { title: 'Surat Keluar', ...keluar },
    { title: 'Tugas', ...tugas },
    { title: 'Instansi', columns: instansi.columns, rows: instansi.rows },
  ];
}

let running = false;

async function setStatus(d: Deps, s: GoogleRunStatus) {
  await d.uow.run((r) => r.settings.set('google_status', s));
}

/** Satu putaran sinkronisasi: lampiran baru ke Drive, lalu seluruh tabel ditulis ulang ke spreadsheet. */
export async function runSync(d: Deps) {
  if (running) throw conflict('Sinkronisasi sedang berjalan');
  running = true;
  const mulai = new Date().toISOString();
  await setStatus(d, { ...(await loadStatus(d)), berjalan: true, mulai, galat: null });
  const hasil = { file_baru: 0, file_gagal: 0, file_sisa: 0, lembar: 0, baris: 0 };
  try {
    const g = await loadGoogle(d);
    const a = needAuth(g);
    const root = await rootFolder(d, g, a);
    const cache = (await d.uow.read.settings.get<Record<string, string>>('google_folders')) || {};
    const pending = await d.uow.read.attachments.pendingDrive(SYNC_BATCH);
    let lastError: string | null = null;
    for (const p of pending) {
      try {
        const parent = await folderPath(d, a, root, driveFolderFor(p), cache);
        const name = p.versi > 1 ? clean(p.nama, 150).replace(/(\.[A-Za-z0-9]+)?$/, ` (versi ${p.versi})$1`) : clean(p.nama, 150);
        const f = await d.google.upload(a, { name, mime: p.mime, parentId: parent, body: await d.files.read(p.path) });
        await d.uow.run((r) => r.attachments.setDrive(p.id, f.id));
        hasil.file_baru++;
      } catch (e) {
        hasil.file_gagal++;
        lastError = isAppError(e) ? e.message : (e as Error).message;
        // Kredensial atau kuota bermasalah: hentikan, sisanya dicoba di putaran berikutnya.
        if (isAppError(e) && e.kind === 'invalid') break;
      }
    }
    await d.uow.run((r) => r.settings.set('google_folders', cache));
    const counts = await d.uow.read.attachments.driveCounts();
    hasil.file_sisa = counts.total - counts.tersinkron;

    let sheetId = g.spreadsheet_id;
    if (!sheetId) {
      sheetId = await d.google.createSpreadsheet(a, 'Rekap Sistem Surat', root);
      const latest = await loadGoogle(d);
      await d.uow.run((r) => r.settings.set('google', { ...latest, spreadsheet_id: sheetId }));
    }
    const tables = await sheetTables(d);
    await d.google.writeSheets(a, sheetId, tables);
    hasil.lembar = tables.length;
    hasil.baris = tables.reduce((s, t) => s + t.rows.length, 0);
    const galat = hasil.file_gagal ? `${hasil.file_gagal} file gagal diunggah: ${lastError}` : null;
    await setStatus(d, { berjalan: false, mulai, selesai: new Date().toISOString(), galat, hasil });
    return hasil;
  } catch (e) {
    const galat = isAppError(e) ? e.message : 'Sinkronisasi gagal karena kesalahan server';
    if (!isAppError(e)) console.error('Sinkronisasi Google gagal:', e);
    await setStatus(d, { berjalan: false, mulai, selesai: new Date().toISOString(), galat, hasil });
    throw e;
  } finally {
    running = false;
  }
}

/** Mulai sinkronisasi di latar; halaman memantau kemajuannya lewat status. */
export async function syncNow(d: Deps, ctx: Ctx) {
  requireAdmin(ctx);
  needAuth(await loadGoogle(d));
  if (running) throw conflict('Sinkronisasi sedang berjalan');
  await d.uow.run((r) => auditFor(r, ctx, 'GOOGLE_SINKRON', 'setting', 'google', {}));
  runSync(d).catch(() => {});
  // Tunggu sebentar agar status "berjalan" sudah tersimpan saat halaman memuat ulang.
  await new Promise((r) => setTimeout(r, 50));
  return status(d, ctx);
}

/** Dipanggil penjadwal tiap menit: jalankan bila otomatis aktif dan selang waktunya sudah lewat. */
export async function scheduledSync(d: Deps, now = new Date()) {
  const g = await loadGoogle(d);
  if (!g.sinkron_otomatis || !authOf(g) || running) return false;
  const s = await loadStatus(d);
  const last = s.selesai ? new Date(s.selesai).getTime() : 0;
  if (now.getTime() - last < (g.sinkron_tiap_jam || 24) * 3600_000) return false;
  await runSync(d).catch(() => {});
  return true;
}

export const isSyncing = () => running;
