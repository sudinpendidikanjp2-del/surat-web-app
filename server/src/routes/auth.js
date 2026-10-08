import { Router } from 'express';
import { one, q } from '../db.js';
import { wrap, str, bad, HttpError } from '../util.js';
import { hashPassword, verifyPassword, createSession, destroySession, setSessionCookie, clearSessionCookie, limiter, requireAuth } from '../security.js';
import { audit } from '../record.js';
import { ROLE_LABEL } from '../perm.js';

const r = Router();
const loginLimit = limiter({ windowMs: 10 * 60 * 1000, max: 10, key: (req) => `${req.ip}|${String(req.body?.username || '').toLowerCase()}` });

const publicUser = (u) => ({
  id: u.id, username: u.username, nama: u.nama, nip: u.nip, jabatan: u.jabatan, role: u.role,
  roleLabel: ROLE_LABEL[u.role], unitId: u.unit_id, unitNama: u.unit_nama, email: u.email,
});

r.post('/login', loginLimit, wrap(async (req, res) => {
  const username = str(req.body.username, 'Nama pengguna', { max: 80 }).toLowerCase();
  const password = str(req.body.password, 'Kata sandi', { max: 200 });
  const u = await one(
    `SELECT u.*, un.nama AS unit_nama FROM users u LEFT JOIN units un ON un.id=u.unit_id WHERE u.username=$1`, [username],
  );
  // verifikasi tetap dijalankan walau user tidak ada agar waktu respons seragam
  const ok = u ? await verifyPassword(password, u.password_hash) : await verifyPassword(password, 'scrypt$00$00');
  if (!u || !u.aktif || !ok) {
    await audit(null, { user: u, ip: req.ip }, 'LOGIN_GAGAL', 'user', username);
    throw new HttpError(401, 'Nama pengguna atau kata sandi salah');
  }
  const token = await createSession(u.id);
  setSessionCookie(req, res, token);
  await audit(null, { user: u, ip: req.ip }, 'LOGIN', 'user', u.id);
  res.json({ user: publicUser(u) });
}));

r.post('/logout', requireAuth, wrap(async (req, res) => {
  await destroySession(req.sessionToken);
  clearSessionCookie(res);
  await audit(null, req, 'LOGOUT', 'user', req.user.id);
  res.json({ ok: true });
}));

r.get('/me', wrap(async (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: publicUser(req.user) });
}));

r.post('/password', requireAuth, wrap(async (req, res) => {
  const lama = str(req.body.lama, 'Kata sandi lama', { max: 200 });
  const baru = str(req.body.baru, 'Kata sandi baru', { max: 200 });
  if (baru.length < 8) throw bad('Kata sandi baru minimal 8 karakter');
  const u = await one('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!(await verifyPassword(lama, u.password_hash))) throw bad('Kata sandi lama salah');
  await q('UPDATE users SET password_hash=$1 WHERE id=$2', [await hashPassword(baru), req.user.id]);
  await q(`DELETE FROM sessions WHERE user_id=$1 AND token_hash <> encode(sha256(convert_to($2,'UTF8')),'hex')`, [req.user.id, req.sessionToken]);
  await audit(null, req, 'UBAH_PASSWORD', 'user', req.user.id);
  res.json({ ok: true });
}));

export default r;
