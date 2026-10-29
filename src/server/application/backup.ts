import { forbidden, invalid, isAppError } from '@/domain/errors';
import { can } from '@/domain/roles';
import { str } from '@/domain/validation';
import { auditFor, type Ctx, type Deps } from './context';
import type { BackupInfo, BackupKind } from './ports';
import { authOf, backupFolder, loadGoogle } from './google';

type Body = Record<string, unknown>;

/**
 * Cadangan dan pemulihan seluruh data (database dan file). Pemulihan selalu didahului cadangan pengaman
 * otomatis, sehingga kesalahan memilih file masih dapat dibatalkan dengan memulihkan cadangan itu.
 */
export interface BackupSchedule { otomatis: boolean; jam: string; simpan: number; ke_drive: boolean }
export interface BackupRunStatus { terakhir: string | null; tanggal_otomatis: string | null; galat: string | null; drive: string | null }

export const CONFIRM_WORD = 'PULIHKAN';
const KEEP_SETTINGS = ['google', 'google_folders', 'cadangan', 'cadangan_status'];
const DEFAULT_SCHEDULE: BackupSchedule = { otomatis: false, jam: '02:00', simpan: 7, ke_drive: false };

const requireAdmin = (ctx: Ctx) => { if (!can.admin(ctx.actor)) throw forbidden(); };
const loadSchedule = async (d: Deps) => ({ ...DEFAULT_SCHEDULE, ...((await d.uow.read.settings.get<BackupSchedule>('cadangan')) || {}) });
const loadRun = async (d: Deps) =>
  (await d.uow.read.settings.get<BackupRunStatus>('cadangan_status')) || { terakhir: null, tanggal_otomatis: null, galat: null, drive: null };

/** Tanggal dan jam saat ini di zona waktu kantor. */
export function localNow(tz: string, now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export async function overview(d: Deps, ctx: Ctx) {
  requireAdmin(ctx);
  const g = await loadGoogle(d);
  return {
    cadangan: await d.backups.list(),
    jadwal: await loadSchedule(d),
    status: await loadRun(d),
    berjalan: d.backups.busy(),
    google: !!authOf(g),
    kata_konfirmasi: CONFIRM_WORD,
  };
}

/** Unggah arsip ke folder Cadangan di Google Drive. Mengembalikan pesan galat bila gagal, tanpa membatalkan cadangan lokal. */
async function toDrive(d: Deps, info: BackupInfo) {
  try {
    const { a, id } = await backupFolder(d);
    await d.google.upload(a, { name: info.nama, mime: 'application/gzip', parentId: id, body: { path: d.backups.path(info.nama), size: info.ukuran } });
    return null;
  } catch (e) {
    return isAppError(e) ? e.message : 'Gagal mengunggah ke Google Drive';
  }
}

export async function create(d: Deps, ctx: Ctx, b: Body) {
  requireAdmin(ctx);
  const label = str(b.label, 'Keterangan', { max: 120, required: false }) || `Dibuat oleh ${ctx.actor.nama}`;
  const info = await d.backups.create('manual', label);
  const driveError = b.ke_drive ? await toDrive(d, info) : null;
  await d.uow.run((r) => auditFor(r, ctx, 'CADANGAN_DIBUAT', 'cadangan', info.nama, { ukuran: info.ukuran, file: info.file, drive: b.ke_drive ? !driveError : null }));
  return { cadangan: info, drive: b.ke_drive ? (driveError ? { ok: false, pesan: driveError } : { ok: true }) : null };
}

export async function download(d: Deps, ctx: Ctx, nama: string) {
  requireAdmin(ctx);
  const path = d.backups.path(nama);
  await d.uow.run((r) => auditFor(r, ctx, 'CADANGAN_DIUNDUH', 'cadangan', nama, {}));
  return { path, filename: nama };
}

export async function remove(d: Deps, ctx: Ctx, nama: string) {
  requireAdmin(ctx);
  d.backups.path(nama);
  await d.backups.remove(nama);
  await d.uow.run((r) => auditFor(r, ctx, 'CADANGAN_DIHAPUS', 'cadangan', nama, {}));
}

export async function upload(d: Deps, ctx: Ctx, source: AsyncIterable<Uint8Array> | NodeJS.ReadableStream) {
  requireAdmin(ctx);
  const info = await d.backups.receive(source, 'unggahan');
  await d.uow.run((r) => auditFor(r, ctx, 'CADANGAN_DIUNGGAH', 'cadangan', info.nama, { ukuran: info.ukuran, dibuat: info.dibuat }));
  return info;
}

/**
 * Pulihkan: (1) periksa kata konfirmasi, (2) buat cadangan pengaman dari keadaan sekarang, (3) ganti data dan file.
 * Semua sesi berakhir karena tabel pengguna ikut diganti; admin masuk lagi dengan akun dari cadangan.
 */
export async function restore(d: Deps, ctx: Ctx, nama: string, b: Body) {
  requireAdmin(ctx);
  if (String(b.konfirmasi || '').trim().toUpperCase() !== CONFIRM_WORD) throw invalid(`Ketik ${CONFIRM_WORD} untuk memastikan pemulihan`);
  const target = await d.backups.info(nama);
  if (!target) throw invalid('Cadangan tidak ditemukan');
  const pengaman = await d.backups.create('sebelum-pemulihan', `Sebelum memulihkan ${target.dibuat.slice(0, 16).replace('T', ' ')}`);
  // Sambungan Google dan jadwal cadangan milik server ini, bukan milik data: dipertahankan seperti sebelum pemulihan.
  const keep = Object.fromEntries(await Promise.all(KEEP_SETTINGS.map(async (k) => [k, await d.uow.read.settings.get(k)] as const)));
  const out = await d.backups.restore(nama);
  await d.uow.run(async (r) => { for (const [k, v] of Object.entries(keep)) if (v != null) await r.settings.set(k, v); });
  // Pelaku belum tentu ada di data yang dipulihkan, jadi namanya dicatat di rincian, bukan sebagai rujukan pengguna.
  await d.uow.run((r) => r.journal.audit({
    userId: null, ip: ctx.ip, aksi: 'CADANGAN_DIPULIHKAN', entitas: 'cadangan', entitasId: nama,
    detail: { oleh: ctx.actor.username, nama: ctx.actor.nama, pengaman: pengaman.nama, tabel: out.tabel, file: out.file },
  }));
  return { ok: true, pengaman: pengaman.nama, dipulihkan: out };
}

export async function saveSchedule(d: Deps, ctx: Ctx, b: Body) {
  requireAdmin(ctx);
  const jam = String(b.jam || '');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(jam)) throw invalid('Jam cadangan harus berformat JJ:MM, misalnya 02:00');
  const simpan = Number(b.simpan);
  if (!Number.isInteger(simpan) || simpan < 1 || simpan > 90) throw invalid('Jumlah cadangan yang disimpan harus 1 sampai 90');
  const value: BackupSchedule = { otomatis: Boolean(b.otomatis), jam, simpan, ke_drive: Boolean(b.ke_drive) };
  if (value.ke_drive && !authOf(await loadGoogle(d))) throw invalid('Hubungkan Google Drive terlebih dahulu untuk menyalin cadangan ke Drive');
  await d.uow.run(async (r) => {
    await r.settings.set('cadangan', value);
    await auditFor(r, ctx, 'PENGATURAN_DIUBAH', 'setting', 'cadangan', value as unknown as Record<string, unknown>);
  });
  return value;
}

/** Dipanggil penjadwal tiap menit. Sekali sehari setelah jam yang ditentukan; cadangan otomatis lama dibuang. */
export async function scheduled(d: Deps, now = new Date()) {
  const s = await loadSchedule(d);
  if (!s.otomatis || d.backups.busy()) return false;
  const local = localNow(d.timezone, now);
  const run = await loadRun(d);
  if (run.tanggal_otomatis === local.date || local.time < s.jam) return false;
  const next: BackupRunStatus = { ...run, tanggal_otomatis: local.date, galat: null, drive: null };
  try {
    const info = await d.backups.create('otomatis', 'Cadangan harian otomatis');
    await d.backups.prune('otomatis', s.simpan);
    next.terakhir = info.dibuat;
    if (s.ke_drive) next.drive = await toDrive(d, info);
  } catch (e) {
    next.galat = isAppError(e) ? e.message : (e as Error).message;
    console.error('Cadangan otomatis gagal:', next.galat);
  }
  await d.uow.run((r) => r.settings.set('cadangan_status', next));
  return true;
}

/* ---------- Cadangan di Google Drive ---------- */

export async function driveList(d: Deps, ctx: Ctx) {
  requireAdmin(ctx);
  const { a, id } = await backupFolder(d);
  const files = await d.google.list(a, id, 'cadangan-');
  return files.filter((f) => f.name.endsWith('.tar.gz')).map((f) => ({ id: f.id, nama: f.name, ukuran: Number(f.size || 0), diubah: f.modifiedTime ?? null, tautan: f.webViewLink ?? null }));
}

export async function copyToDrive(d: Deps, ctx: Ctx, nama: string) {
  requireAdmin(ctx);
  const info = await d.backups.info(nama);
  if (!info) throw invalid('Cadangan tidak ditemukan');
  const err = await toDrive(d, info);
  if (err) throw invalid(err);
  await d.uow.run((r) => auditFor(r, ctx, 'CADANGAN_KE_DRIVE', 'cadangan', nama, {}));
  return { ok: true };
}

/** Unduh cadangan dari Drive ke server (diperiksa dulu), lalu tampil di daftar dan dapat dipulihkan seperti biasa. */
export async function fetchFromDrive(d: Deps, ctx: Ctx, fileId: unknown) {
  requireAdmin(ctx);
  const id = str(fileId, 'File di Google Drive', { max: 200 });
  const g = await loadGoogle(d);
  const a = authOf(g);
  if (!a) throw invalid('Google belum terhubung');
  const stream = await d.google.download(a, id);
  const info = await d.backups.receive(stream as unknown as AsyncIterable<Uint8Array>, 'drive' as BackupKind);
  await d.uow.run((r) => auditFor(r, ctx, 'CADANGAN_DARI_DRIVE', 'cadangan', info.nama, { drive: id }));
  return info;
}
