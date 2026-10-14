import { forbidden, invalid, notFound } from '@/domain/errors';
import { can, ROLE_LABEL, ROLES } from '@/domain/roles';
import { csvList, int, oneOf, str } from '@/domain/validation';
import { withBrandingDefaults, type Branding } from '@/domain/branding';
import { auditFor, runBulk, runRows, type Ctx, type Deps } from './context';
import type { IncomingFile } from './ports';

type Body = Record<string, unknown>;
const requireAdmin = (ctx: Ctx) => { if (!can.admin(ctx.actor)) throw forbidden(); };

/* ---------- Pengguna ---------- */

export const userOptions = (d: Deps) => d.uow.read.users.options();

const userFilter = (q: Record<string, string | undefined>) => ({
  roles: csvList(q.role), unit: int(q.unit, 'Unit', { required: false }), aktif: q.aktif === '1' ? true : q.aktif === '0' ? false : null, q: q.q?.slice(0, 80),
});

export function listUsers(d: Deps, ctx: Ctx, q: Record<string, string | undefined>) {
  requireAdmin(ctx);
  return d.uow.read.users.list(userFilter(q), q);
}
export function userIds(d: Deps, ctx: Ctx, q: Record<string, string | undefined>) {
  requireAdmin(ctx);
  return d.uow.read.users.ids(userFilter(q));
}

function userBody(b: Body, creating: boolean) {
  const out = {
    nama: str(b.nama, 'Nama', { max: 120 }),
    nip: str(b.nip, 'NIP', { max: 30, required: false }),
    pangkat: str(b.pangkat, 'Pangkat', { max: 60, required: false }),
    jabatan: str(b.jabatan, 'Jabatan', { max: 120, required: false }),
    email: str(b.email, 'Email', { max: 160, required: false }),
    role: oneOf(b.role, ROLES, 'Peran'),
    unit_id: int(b.unit_id, 'Unit kerja', { required: false }),
    username: creating ? str(b.username, 'Nama pengguna', { max: 40 }).toLowerCase() : '',
  };
  if (creating && !/^[a-z0-9._-]+$/.test(out.username)) throw invalid('Nama pengguna hanya boleh huruf kecil, angka, titik, garis bawah, atau strip');
  if (out.email && !/^\S+@\S+\.\S+$/.test(out.email)) throw invalid('Format email tidak valid');
  return out;
}

const password = (v: unknown, name: string) => {
  const pw = str(v, name, { max: 200 });
  if (pw.length < 8) throw invalid('Kata sandi minimal 8 karakter');
  return pw;
};

export async function createUser(d: Deps, ctx: Ctx, b: Body) {
  requireAdmin(ctx);
  const data = userBody(b, true);
  const hash = await d.passwords.hash(password(b.password, 'Kata sandi awal'));
  return d.uow.run(async (r) => {
    if (await r.users.usernameExists(data.username)) throw invalid('Nama pengguna sudah dipakai');
    const id = await r.users.insert({ ...data, password_hash: hash });
    await auditFor(r, ctx, 'USER_DIBUAT', 'user', id, { username: data.username, role: data.role });
    return { id };
  });
}

export async function updateUser(d: Deps, ctx: Ctx, id: number, b: Body) {
  requireAdmin(ctx);
  const data = userBody(b, false);
  const aktif = b.aktif !== false;
  if (id === ctx.actor.id && (!aktif || data.role !== 'superadmin')) throw invalid('Anda tidak dapat menonaktifkan atau menurunkan peran akun sendiri');
  const hash = b.password ? await d.passwords.hash(password(b.password, 'Kata sandi')) : null;
  await d.uow.run(async (r) => {
    if (!(await r.users.update(id, { ...data, aktif }))) throw notFound();
    if (!aktif) await r.sessions.deleteForUser(id);
    if (hash) {
      await r.users.setPasswordHash(id, hash);
      await r.sessions.deleteForUser(id);
    }
    await auditFor(r, ctx, 'USER_DIUBAH', 'user', id, { role: data.role, aktif, resetPassword: Boolean(hash) });
  });
}

export function setUsersActive(d: Deps, ctx: Ctx, b: Body) {
  requireAdmin(ctx);
  const aktif = Boolean(b.aktif);
  return runBulk(b.ids, (id) => d.uow.run(async (r) => {
    if (id === ctx.actor.id) throw invalid('Anda tidak dapat menonaktifkan akun sendiri');
    if (!(await r.users.setActive(id, aktif))) throw notFound();
    if (!aktif) await r.sessions.deleteForUser(id);
    await auditFor(r, ctx, aktif ? 'USER_DIAKTIFKAN' : 'USER_DINONAKTIFKAN', 'user', id, { massal: true });
  }));
}

/** Impor pengguna. Kolom: nama_pengguna, nama, peran (kode peran atau labelnya), kode_unit, jabatan, nip, email, kata_sandi_awal. */
export function importUsers(d: Deps, ctx: Ctx, rows: Record<string, string>[]) {
  requireAdmin(ctx);
  const byLabel = Object.fromEntries(ROLES.map((r) => [ROLE_LABEL[r].toLowerCase(), r]));
  return runRows(rows, async (x) => {
    const roleRaw = (x.peran || x.role || '').trim().toLowerCase();
    const role = (ROLES as readonly string[]).includes(roleRaw) ? roleRaw : byLabel[roleRaw];
    if (!role) throw invalid(`Peran "${x.peran || ''}" tidak dikenal. Pakai salah satu: ${ROLES.join(', ')}`);
    const unitId = x.kode_unit ? await d.uow.read.units.idByCode(x.kode_unit.toUpperCase()) : null;
    if (x.kode_unit && !unitId) throw invalid(`Kode unit "${x.kode_unit}" tidak ditemukan`);
    return createUser(d, ctx, { username: x.nama_pengguna || x.username, nama: x.nama, role, unit_id: unitId, jabatan: x.jabatan, nip: x.nip, email: x.email, password: x.kata_sandi_awal || x.kata_sandi || x.password });
  });
}

export async function exportUsers(d: Deps, ctx: Ctx, q: Record<string, string | undefined>) {
  requireAdmin(ctx);
  // Daftar pengguna dibaca per 100 (batas halaman) sampai habis.
  const items: Record<string, unknown>[] = [];
  for (let page = 1; page <= 100; page++) {
    const p = await d.uow.read.users.list(userFilter(q), { ...q, page: String(page), pageSize: '100' });
    items.push(...(p.items as Record<string, unknown>[]));
    if (items.length >= p.total || p.items.length === 0) break;
  }
  return { columns: ['Nama pengguna', 'Nama', 'Peran', 'Unit kerja', 'Jabatan', 'NIP', 'Email', 'Aktif'], rows: items.map((u: Record<string, unknown>) => [u.username, u.nama, ROLE_LABEL[u.role as keyof typeof ROLE_LABEL], u.unit_nama, u.jabatan, u.nip, u.email, u.aktif ? 'Ya' : 'Tidak']) };
}

/* ---------- Unit kerja ---------- */

export const listUnits = (d: Deps) => d.uow.read.units.list();

export async function createUnit(d: Deps, ctx: Ctx, b: Body) {
  requireAdmin(ctx);
  const nama = str(b.nama, 'Nama unit', { max: 120 });
  const kode = str(b.kode, 'Kode unit', { max: 20 }).toUpperCase();
  return d.uow.run(async (r) => {
    if (await r.units.codeExists(kode)) throw invalid('Kode unit sudah dipakai');
    const id = await r.units.insert(nama, kode);
    await auditFor(r, ctx, 'UNIT_DIBUAT', 'unit', id, { nama, kode });
    return { id };
  });
}

export async function updateUnit(d: Deps, ctx: Ctx, id: number, b: Body) {
  requireAdmin(ctx);
  const nama = str(b.nama, 'Nama unit', { max: 120 });
  const aktif = b.aktif !== false;
  await d.uow.run(async (r) => {
    if (!(await r.units.update(id, nama, aktif))) throw notFound();
    await auditFor(r, ctx, 'UNIT_DIUBAH', 'unit', id, { nama, aktif });
  });
}

export function importUnits(d: Deps, ctx: Ctx, rows: Record<string, string>[]) {
  requireAdmin(ctx);
  return runRows(rows, (x) => createUnit(d, ctx, { kode: x.kode || x.kode_unit, nama: x.nama || x.nama_unit }));
}

export async function exportUnits(d: Deps, ctx: Ctx) {
  requireAdmin(ctx);
  const rows = await d.uow.read.units.list() as Record<string, unknown>[];
  return { columns: ['Kode', 'Nama', 'Pengguna aktif', 'Aktif'], rows: rows.map((u) => [u.kode, u.nama, u.jumlah_pengguna, u.aktif ? 'Ya' : 'Tidak']) };
}

/* ---------- Pengaturan ---------- */

const SETTING_KEYS = ['instansi', 'penomoran', 'sla', 'tampilan'] as const;

export const settings = (d: Deps) => d.uow.read.settings.all();

export async function saveSetting(d: Deps, ctx: Ctx, keyRaw: string, b: Body) {
  requireAdmin(ctx);
  const key = oneOf(keyRaw, SETTING_KEYS, 'Pengaturan');
  let value: Record<string, unknown>;
  if (key === 'instansi') {
    value = {
      nama: str(b.nama, 'Nama instansi', { max: 160 }),
      alamat: str(b.alamat, 'Alamat', { max: 300, required: false }) || '',
      kota: str(b.kota, 'Kota', { max: 60 }),
      kode_unit: str(b.kode_unit, 'Kode unit pada nomor surat', { max: 30 }),
    };
  } else if (key === 'penomoran') {
    const format = str(b.format, 'Pola nomor', { max: 120 });
    if (!format.includes('{urut}')) throw invalid('Pola nomor harus memuat {urut}');
    value = { format, kode_default: str(b.kode_default, 'Kode klasifikasi bawaan', { max: 20 }), digits: int(b.digits, 'Jumlah digit', { min: 1, max: 8 }) };
  } else if (key === 'tampilan') {
    const cur = withBrandingDefaults(await d.uow.read.settings.get<Branding>('tampilan'));
    value = {
      ...cur,
      nama: str(b.nama, 'Nama aplikasi', { max: 60 }),
      tagline: str(b.tagline, 'Keterangan singkat', { max: 80, required: false }) || '',
      judul_tab: str(b.judul_tab, 'Judul di tab peramban', { max: 70 }),
      deskripsi: str(b.deskripsi, 'Deskripsi', { max: 200, required: false }) || '',
    };
  } else {
    value = Object.fromEntries(['Rendah', 'Normal', 'Tinggi', 'Mendesak'].map((k) => [k, int(b[k], `Batas hari ${k}`, { min: 1, max: 60 })]));
  }
  await d.uow.run(async (r) => {
    await r.settings.set(key, value);
    await auditFor(r, ctx, 'PENGATURAN_DIUBAH', 'setting', key, value);
  });
}

/* ---------- Ikon aplikasi ---------- */

const ICON_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

export const branding = async (d: Deps) => withBrandingDefaults(await d.uow.read.settings.get<Branding>('tampilan'));

/** Ikon PNG atau JPG, persegi, maks 512 KB. Dipakai sebagai favicon dan tanda di menu samping. */
export async function saveBrandIcon(d: Deps, ctx: Ctx, file: IncomingFile | null) {
  requireAdmin(ctx);
  if (!file) throw invalid('Pilih file ikon');
  const ext = d.files.validate(file);
  if (!ICON_TYPES[ext]) throw invalid('Ikon harus berformat PNG atau JPG');
  if (file.buffer.length > 512 * 1024) throw invalid('Ikon maksimal 512 KB');
  const path = await d.files.save(file.buffer, ext);
  const cur = await branding(d);
  const value = { ...cur, ikon: path, ikon_versi: (cur.ikon_versi || 0) + 1 };
  await d.uow.run(async (r) => {
    await r.settings.set('tampilan', value);
    await auditFor(r, ctx, 'PENGATURAN_DIUBAH', 'setting', 'tampilan', { ikon: 'diganti' });
  });
}

export async function removeBrandIcon(d: Deps, ctx: Ctx) {
  requireAdmin(ctx);
  const cur = await branding(d);
  await d.uow.run(async (r) => {
    await r.settings.set('tampilan', { ...cur, ikon: null, ikon_versi: (cur.ikon_versi || 0) + 1 });
    await auditFor(r, ctx, 'PENGATURAN_DIUBAH', 'setting', 'tampilan', { ikon: 'dihapus' });
  });
}

export async function brandIcon(d: Deps) {
  const b = await branding(d);
  if (!b.ikon) throw notFound('Ikon belum diatur');
  const ext = b.ikon.split('.').pop()!.toLowerCase();
  return { body: await d.files.read(b.ikon), mime: ICON_TYPES[ext] || 'application/octet-stream' };
}

/* ---------- Audit log (baca saja) ---------- */

export function auditLog(d: Deps, ctx: Ctx, q: Record<string, string | undefined>) {
  if (!can.audit(ctx.actor)) throw forbidden();
  return d.uow.read.journal.auditPage({
    limit: Math.min(int(q.limit, 'limit', { required: false, min: 1, max: 200 }) || 50, 200),
    offset: int(q.offset, 'offset', { required: false, min: 0 }) || 0,
    aksi: q.aksi || null,
    user: int(q.user, 'user', { required: false }),
    q: q.q ? q.q.slice(0, 80) : null,
  });
}

/* ---------- Notifikasi ---------- */

export function notifications(d: Deps, ctx: Ctx, q: Record<string, string | undefined>) {
  const pageSize = Math.min(Math.max(parseInt(q.pageSize || '', 10) || 20, 1), 100);
  const page = Math.max(parseInt(q.page || '', 10) || 1, 1);
  return d.uow.read.journal.notifications(ctx.actor.id, { page, pageSize, unreadOnly: q.belum === '1' });
}

export async function markRead(d: Deps, ctx: Ctx, b: Body) {
  const ids = b.all ? 'all' : Array.isArray(b.ids) ? b.ids.map(Number).filter(Number.isInteger) : [];
  await d.uow.run((r) => r.journal.markRead(ctx.actor.id, ids));
}

export const markReadMany = (d: Deps, ctx: Ctx, b: Body) =>
  runBulk(b.ids, (id) => d.uow.run((r) => r.journal.markRead(ctx.actor.id, [id])));
