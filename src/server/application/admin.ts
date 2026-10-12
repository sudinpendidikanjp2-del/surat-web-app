import { forbidden, invalid, notFound } from '@/domain/errors';
import { can, ROLES } from '@/domain/roles';
import { csvList, int, oneOf, str } from '@/domain/validation';
import { auditFor, runBulk, type Ctx, type Deps } from './context';

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

/* ---------- Pengaturan ---------- */

const SETTING_KEYS = ['instansi', 'penomoran', 'sla'] as const;

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
  } else {
    value = Object.fromEntries(['Rendah', 'Normal', 'Tinggi', 'Mendesak'].map((k) => [k, int(b[k], `Batas hari ${k}`, { min: 1, max: 60 })]));
  }
  await d.uow.run(async (r) => {
    await r.settings.set(key, value);
    await auditFor(r, ctx, 'PENGATURAN_DIUBAH', 'setting', key, value);
  });
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
