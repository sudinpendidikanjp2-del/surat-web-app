import { Router } from 'express';
import { one, all, q } from '../db.js';
import { wrap, str, oneOf, bad, notFound, int } from '../util.js';
import { hashPassword } from '../security.js';
import { audit } from '../record.js';
import { ROLES, requireRole } from '../perm.js';

const r = Router();

/* Opsi pengguna untuk dropdown (semua pengguna login). */
r.get('/users/options', wrap(async (_req, res) => {
  res.json(await all(`SELECT u.id,u.username,u.nama,u.jabatan,u.role,u.unit_id,u.nip,u.pangkat,un.nama AS unit_nama
                        FROM users u LEFT JOIN units un ON un.id=u.unit_id WHERE u.aktif ORDER BY u.nama`));
}));
r.get('/units', wrap(async (_req, res) => {
  res.json(await all(`SELECT un.*, (SELECT count(*) FROM users u WHERE u.unit_id=un.id AND u.aktif) AS jumlah_pengguna FROM units un ORDER BY un.nama`));
}));

r.get('/users', requireRole('superadmin'), wrap(async (_req, res) => {
  res.json(await all(`SELECT u.id,u.username,u.nama,u.nip,u.pangkat,u.jabatan,u.email,u.role,u.unit_id,u.aktif,un.nama AS unit_nama
                        FROM users u LEFT JOIN units un ON un.id=u.unit_id ORDER BY u.aktif DESC, u.nama`));
}));

function userBody(b, { creating }) {
  const out = {
    nama: str(b.nama, 'Nama', { max: 120 }),
    nip: str(b.nip, 'NIP', { max: 30, required: false }),
    pangkat: str(b.pangkat, 'Pangkat', { max: 60, required: false }),
    jabatan: str(b.jabatan, 'Jabatan', { max: 120, required: false }),
    email: str(b.email, 'Email', { max: 160, required: false }),
    role: oneOf(b.role, ROLES, 'Peran'),
    unit_id: int(b.unit_id, 'Unit kerja', { required: false }),
  };
  if (creating) {
    out.username = str(b.username, 'Nama pengguna', { max: 40 }).toLowerCase();
    if (!/^[a-z0-9._-]+$/.test(out.username)) throw bad('Nama pengguna hanya boleh huruf kecil, angka, titik, garis bawah, atau strip');
  }
  if (out.email && !/^\S+@\S+\.\S+$/.test(out.email)) throw bad('Format email tidak valid');
  return out;
}

r.post('/users', requireRole('superadmin'), wrap(async (req, res) => {
  const b = userBody(req.body, { creating: true });
  const pw = str(req.body.password, 'Kata sandi awal', { max: 200 });
  if (pw.length < 8) throw bad('Kata sandi minimal 8 karakter');
  if (await one('SELECT 1 FROM users WHERE username=$1', [b.username])) throw bad('Nama pengguna sudah dipakai');
  const u = await one(
    `INSERT INTO users(username,nama,nip,pangkat,jabatan,email,role,unit_id,password_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [b.username, b.nama, b.nip, b.pangkat, b.jabatan, b.email, b.role, b.unit_id, await hashPassword(pw)],
  );
  await audit(null, req, 'USER_DIBUAT', 'user', u.id, { username: b.username, role: b.role });
  res.status(201).json({ id: u.id });
}));

r.put('/users/:id', requireRole('superadmin'), wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  const b = userBody(req.body, { creating: false });
  const aktif = req.body.aktif !== false;
  if (id === req.user.id && (!aktif || b.role !== 'superadmin')) throw bad('Anda tidak dapat menonaktifkan atau menurunkan peran akun sendiri');
  const u = await one(
    `UPDATE users SET nama=$1,nip=$2,pangkat=$3,jabatan=$4,email=$5,role=$6,unit_id=$7,aktif=$8 WHERE id=$9 RETURNING id`,
    [b.nama, b.nip, b.pangkat, b.jabatan, b.email, b.role, b.unit_id, aktif, id],
  );
  if (!u) throw notFound();
  if (!aktif) await q('DELETE FROM sessions WHERE user_id=$1', [id]);
  if (req.body.password) {
    const pw = str(req.body.password, 'Kata sandi', { max: 200 });
    if (pw.length < 8) throw bad('Kata sandi minimal 8 karakter');
    await q('UPDATE users SET password_hash=$1 WHERE id=$2', [await hashPassword(pw), id]);
    await q('DELETE FROM sessions WHERE user_id=$1', [id]);
  }
  await audit(null, req, 'USER_DIUBAH', 'user', id, { role: b.role, aktif, resetPassword: Boolean(req.body.password) });
  res.json({ ok: true });
}));

r.post('/units', requireRole('superadmin'), wrap(async (req, res) => {
  const nama = str(req.body.nama, 'Nama unit', { max: 120 });
  const kode = str(req.body.kode, 'Kode unit', { max: 20 }).toUpperCase();
  if (await one('SELECT 1 FROM units WHERE kode=$1', [kode])) throw bad('Kode unit sudah dipakai');
  const u = await one('INSERT INTO units(nama,kode) VALUES($1,$2) RETURNING id', [nama, kode]);
  await audit(null, req, 'UNIT_DIBUAT', 'unit', u.id, { nama, kode });
  res.status(201).json({ id: u.id });
}));
r.put('/units/:id', requireRole('superadmin'), wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  const nama = str(req.body.nama, 'Nama unit', { max: 120 });
  const aktif = req.body.aktif !== false;
  const u = await one('UPDATE units SET nama=$1, aktif=$2 WHERE id=$3 RETURNING id', [nama, aktif, id]);
  if (!u) throw notFound();
  await audit(null, req, 'UNIT_DIUBAH', 'unit', id, { nama, aktif });
  res.json({ ok: true });
}));

/* Pengaturan sistem */
const SETTING_KEYS = ['instansi', 'penomoran', 'sla'];
r.get('/settings', wrap(async (_req, res) => {
  const rows = await all('SELECT key,value FROM settings');
  res.json(Object.fromEntries(rows.map((x) => [x.key, x.value])));
}));
r.put('/settings/:key', requireRole('superadmin'), wrap(async (req, res) => {
  const key = oneOf(req.params.key, SETTING_KEYS, 'Pengaturan');
  const b = req.body;
  let value;
  if (key === 'instansi') {
    value = {
      nama: str(b.nama, 'Nama instansi', { max: 160 }),
      alamat: str(b.alamat, 'Alamat', { max: 300, required: false }) || '',
      kota: str(b.kota, 'Kota', { max: 60 }),
      kode_unit: str(b.kode_unit, 'Kode unit pada nomor surat', { max: 30 }),
    };
  } else if (key === 'penomoran') {
    value = {
      format: str(b.format, 'Format nomor', { max: 120 }),
      kode_default: str(b.kode_default, 'Kode klasifikasi bawaan', { max: 20 }),
      digits: int(b.digits, 'Jumlah digit', { min: 1, max: 8 }),
    };
    if (!value.format.includes('{urut}')) throw bad('Format harus memuat {urut}');
  } else {
    value = {};
    for (const k of ['Rendah', 'Normal', 'Tinggi', 'Mendesak']) value[k] = int(b[k], `SLA ${k}`, { min: 1, max: 60 });
  }
  await q(`INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2`, [key, value]);
  await audit(null, req, 'PENGATURAN_DIUBAH', 'setting', key, value);
  res.json({ ok: true });
}));

/* Audit log (baca saja) */
r.get('/audit', requireRole('superadmin', 'pimpinan'), wrap(async (req, res) => {
  const limit = Math.min(int(req.query.limit, 'limit', { required: false, min: 1, max: 200 }) || 50, 200);
  const offset = int(req.query.offset, 'offset', { required: false, min: 0 }) || 0;
  const params = [];
  const where = [];
  if (req.query.aksi) { params.push(String(req.query.aksi)); where.push(`a.aksi = $${params.length}`); }
  if (req.query.user) { params.push(int(req.query.user, 'user')); where.push(`a.user_id = $${params.length}`); }
  if (req.query.q) { params.push(`%${String(req.query.q).slice(0, 80)}%`); where.push(`(a.entitas_id ILIKE $${params.length} OR a.detail::text ILIKE $${params.length})`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await all(
    `SELECT a.id,a.aksi,a.entitas,a.entitas_id,a.detail,a.ip,a.created_at,u.nama AS user_nama
       FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ${w} ORDER BY a.id DESC LIMIT ${limit} OFFSET ${offset}`, params,
  );
  const total = (await one(`SELECT count(*) AS n FROM audit_log a ${w}`, params)).n;
  res.json({ items: rows, total });
}));

/* Notifikasi */
r.get('/notifications', wrap(async (req, res) => {
  const items = await all(
    `SELECT id,tipe,judul,isi,link,dibaca,created_at FROM notifications WHERE user_id=$1 ORDER BY id DESC LIMIT 60`, [req.user.id],
  );
  const unread = (await one('SELECT count(*) AS n FROM notifications WHERE user_id=$1 AND NOT dibaca', [req.user.id])).n;
  res.json({ items, unread });
}));
r.post('/notifications/read', wrap(async (req, res) => {
  if (req.body.all) await q('UPDATE notifications SET dibaca=TRUE WHERE user_id=$1', [req.user.id]);
  else if (Array.isArray(req.body.ids)) await q('UPDATE notifications SET dibaca=TRUE WHERE user_id=$1 AND id = ANY($2::bigint[])', [req.user.id, req.body.ids.map(Number).filter(Number.isInteger)]);
  res.json({ ok: true });
}));

export default r;
