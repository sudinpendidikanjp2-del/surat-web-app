import { forbidden, invalid, notFound } from '@/domain/errors';
import { isLockedRef, isRefKategori, REF_KATEGORI, REF_KEYS, type RefKategori } from '@/domain/reference';
import { can } from '@/domain/roles';
import { int, str } from '@/domain/validation';
import { auditFor, runBulk, runRows, type Ctx, type Deps } from './context';
import type { Repos } from './ports';

type Body = Record<string, unknown>;
const requireAdmin = (ctx: Ctx) => { if (!can.admin(ctx.actor)) throw forbidden(); };
const kategoriOf = (k: unknown) => {
  const v = String(k || '');
  if (!isRefKategori(v)) throw invalid('Kategori referensi tidak dikenal');
  return v;
};

/* ---------- Data referensi ---------- */

/** Semua kategori beserta isinya. Admin melihat juga yang nonaktif. */
export async function listRefs(d: Deps, ctx: Ctx, q: Record<string, string | undefined>) {
  const all = can.admin(ctx.actor) && q.semua === '1';
  const keys = q.kategori ? [kategoriOf(q.kategori)] : REF_KEYS;
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = await d.uow.read.refs.list(k, !all);
  return out;
}

/** Nilai harus ada di daftar aktif. Mengembalikan ejaan resmi (huruf besar kecil sesuai daftar). */
export async function refValue(r: Repos, kategori: RefKategori, value: unknown, label: string, fallback?: string) {
  const raw = String(value ?? '').trim() || fallback || '';
  if (!raw) throw invalid(`${label} wajib diisi`);
  const v = await r.refs.canonical(kategori, raw);
  if (!v) throw invalid(`${label} "${raw}" tidak ada di daftar. Pilih dari daftar atau minta admin menambahkannya`);
  return v;
}

function refBody(b: Body) {
  return {
    nilai: str(b.nilai, 'Nilai', { max: 80 }),
    keterangan: str(b.keterangan, 'Keterangan', { max: 200, required: false }),
    urutan: int(b.urutan, 'Urutan', { required: false, min: 0, max: 999 }) ?? 0,
  };
}

export async function createRef(d: Deps, ctx: Ctx, b: Body) {
  requireAdmin(ctx);
  const kategori = kategoriOf(b.kategori);
  const v = refBody(b);
  return d.uow.run(async (r) => {
    if (await r.refs.exists(kategori, v.nilai)) throw invalid(`"${v.nilai}" sudah ada di ${REF_KATEGORI[kategori].label.toLowerCase()}`);
    const id = await r.refs.insert({ kategori, ...v });
    await auditFor(r, ctx, 'REFERENSI_DIBUAT', 'referensi', id, { kategori, nilai: v.nilai });
    return { id };
  });
}

export async function updateRef(d: Deps, ctx: Ctx, id: number, b: Body) {
  requireAdmin(ctx);
  const v = refBody(b);
  const aktif = b.aktif !== false;
  await d.uow.run(async (r) => {
    const cur = await r.refs.find(id);
    if (!cur) throw notFound();
    if (isLockedRef(cur.kategori, cur.nilai) && (v.nilai !== cur.nilai || !aktif)) throw invalid(`"${cur.nilai}" dipakai sistem, jadi tidak dapat diganti nama atau dinonaktifkan`);
    if (await r.refs.exists(cur.kategori, v.nilai, id)) throw invalid(`"${v.nilai}" sudah ada`);
    await r.refs.update(id, { ...v, aktif });
    await auditFor(r, ctx, 'REFERENSI_DIUBAH', 'referensi', id, { kategori: cur.kategori, nilai: v.nilai, aktif });
  });
}

export function setRefsActive(d: Deps, ctx: Ctx, b: Body) {
  requireAdmin(ctx);
  const aktif = Boolean(b.aktif);
  return runBulk(b.ids, (id) => d.uow.run(async (r) => {
    const cur = await r.refs.find(id);
    if (!cur) throw notFound();
    if (!aktif && isLockedRef(cur.kategori, cur.nilai)) throw invalid(`"${cur.nilai}" dipakai sistem dan tidak dapat dinonaktifkan`);
    await r.refs.setActive(id, aktif);
    await auditFor(r, ctx, aktif ? 'REFERENSI_DIAKTIFKAN' : 'REFERENSI_DINONAKTIFKAN', 'referensi', id, { massal: true });
  }));
}

/** Impor: kolom "nilai" (wajib), "keterangan", "urutan". Nilai yang sudah ada dilewati dengan pesan. */
export function importRefs(d: Deps, ctx: Ctx, kategoriRaw: unknown, rows: Record<string, string>[]) {
  requireAdmin(ctx);
  const kategori = kategoriOf(kategoriRaw);
  return runRows(rows, (row) => createRef(d, ctx, { kategori, nilai: row.nilai || row.nama, keterangan: row.keterangan, urutan: row.urutan }));
}

export async function exportRefs(d: Deps, ctx: Ctx, kategoriRaw: unknown) {
  requireAdmin(ctx);
  const kategori = kategoriOf(kategoriRaw);
  const rows = await d.uow.read.refs.list(kategori, false);
  return { title: REF_KATEGORI[kategori].label, columns: ['Nilai', 'Keterangan', 'Urutan', 'Aktif'], rows: rows.map((x) => [x.nilai, x.keterangan, x.urutan, x.aktif ? 'Ya' : 'Tidak']) };
}

/** Dipanggil saat sistem mulai: isi kategori yang masih kosong dengan nilai bawaan. */
export async function ensureRefDefaults(r: Repos) {
  for (const k of REF_KEYS) {
    if ((await r.refs.count(k)) > 0) continue;
    for (const [i, nilai] of REF_KATEGORI[k].defaults.entries()) await r.refs.insert({ kategori: k, nilai, keterangan: null, urutan: i + 1 });
  }
}

/* ---------- Instansi ---------- */

const instansiFilter = (q: Record<string, string | undefined>) => ({ q: q.q?.slice(0, 80), aktif: q.aktif === '1' ? true : q.aktif === '0' ? false : null });

export function listInstansi(d: Deps, ctx: Ctx, q: Record<string, string | undefined>) {
  if (!can.manageIn(ctx.actor) && !can.admin(ctx.actor)) throw forbidden();
  return d.uow.read.instansi.list(instansiFilter(q), q);
}
export const instansiOptions = (d: Deps) => d.uow.read.instansi.options();

function instansiBody(b: Body) {
  const email = str(b.email, 'Email', { max: 160, required: false });
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw invalid('Format email tidak valid');
  return {
    nama: str(b.nama, 'Nama instansi', { max: 200 }),
    singkatan: str(b.singkatan, 'Singkatan', { max: 40, required: false }),
    alamat: str(b.alamat, 'Alamat', { max: 400, required: false }),
    telepon: str(b.telepon, 'Telepon', { max: 40, required: false }),
    email,
  };
}

const requireManage = (ctx: Ctx) => { if (!can.manageIn(ctx.actor)) throw forbidden('Hanya Tata Usaha dan admin yang dapat mengelola instansi'); };

export async function createInstansi(d: Deps, ctx: Ctx, b: Body) {
  requireManage(ctx);
  const v = instansiBody(b);
  return d.uow.run(async (r) => {
    if (await r.instansi.idByName(v.nama)) throw invalid(`Instansi "${v.nama}" sudah ada`);
    const id = await r.instansi.insert(v);
    await auditFor(r, ctx, 'INSTANSI_DIBUAT', 'instansi', id, { nama: v.nama });
    return { id };
  });
}

export async function updateInstansi(d: Deps, ctx: Ctx, id: number, b: Body) {
  requireManage(ctx);
  const v = { ...instansiBody(b), aktif: b.aktif !== false };
  await d.uow.run(async (r) => {
    const other = await r.instansi.idByName(v.nama);
    if (other && other !== id) throw invalid(`Instansi "${v.nama}" sudah ada`);
    if (!(await r.instansi.update(id, v))) throw notFound();
    await auditFor(r, ctx, 'INSTANSI_DIUBAH', 'instansi', id, { nama: v.nama, aktif: v.aktif });
  });
}

export function setInstansiActive(d: Deps, ctx: Ctx, b: Body) {
  requireManage(ctx);
  const aktif = Boolean(b.aktif);
  return runBulk(b.ids, (id) => d.uow.run(async (r) => {
    if (!(await r.instansi.setActive(id, aktif))) throw notFound();
    await auditFor(r, ctx, aktif ? 'INSTANSI_DIAKTIFKAN' : 'INSTANSI_DINONAKTIFKAN', 'instansi', id, { massal: true });
  }));
}

/** Impor kolom: nama (wajib), singkatan, alamat, telepon, email. */
export function importInstansi(d: Deps, ctx: Ctx, rows: Record<string, string>[]) {
  requireManage(ctx);
  return runRows(rows, (row) => createInstansi(d, ctx, { nama: row.nama || row.nama_instansi, singkatan: row.singkatan, alamat: row.alamat, telepon: row.telepon, email: row.email }));
}

export async function exportInstansi(d: Deps, ctx: Ctx, q: Record<string, string | undefined>) {
  requireManage(ctx);
  const rows = await d.uow.read.instansi.all(instansiFilter(q));
  return { columns: ['Nama', 'Singkatan', 'Alamat', 'Telepon', 'Email', 'Jumlah surat', 'Aktif'], rows: rows.map((x) => [x.nama, x.singkatan, x.alamat, x.telepon, x.email, x.jumlah_surat, x.aktif ? 'Ya' : 'Tidak']) };
}

/** Contoh file impor: judul kolom dan satu baris contoh. */
export const IMPORT_TEMPLATES = {
  instansi: { columns: ['Nama', 'Singkatan', 'Alamat', 'Telepon', 'Email'], example: ['Dinas Pendidikan Provinsi', 'Disdik', 'Jl. Contoh No. 1', '021-000000', 'surat@contoh.go.id'] },
  referensi: { columns: ['Nilai', 'Keterangan', 'Urutan'], example: ['Surat Tugas', 'Penugasan pegawai', '10'] },
  'surat-masuk': {
    columns: ['Nomor surat', 'Tanggal surat (YYYY-MM-DD)', 'Tanggal diterima (YYYY-MM-DD)', 'Pengirim', 'Instansi', 'Alamat', 'Perihal', 'Jenis surat', 'Sifat', 'Prioritas', 'Lampiran', 'Catatan'],
    example: ['005/123/X/2026', '2026-10-01', '2026-10-02', 'Kepala Sekolah', 'SDN Contoh 01', 'Jl. Contoh No. 2', 'Permohonan data peserta didik', 'Surat Dinas', 'Biasa', 'Normal', '1 berkas', ''],
  },
  pengguna: {
    columns: ['Nama pengguna', 'Nama', 'Peran', 'Kode unit', 'Jabatan', 'NIP', 'Email', 'Kata sandi awal'],
    example: ['budi.santoso', 'Budi Santoso', 'pelaksana', 'DATA', 'Staf', '', '', 'GantiSegera123'],
  },
  unit: { columns: ['Kode', 'Nama'], example: ['SAR', 'Sarana Prasarana'] },
} as const;
