import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { one, q } from './db.js';
import { config } from './config.js';
import { HttpError, wrap } from './util.js';

const scrypt = promisify(crypto.scrypt);

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(pw, stored) {
  const [alg, saltHex, keyHex] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(keyHex, 'hex');
  const key = await scrypt(pw, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(key, expected);
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await q(`INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2, now() + ($3 || ' hours')::interval)`, [sha(token), userId, String(config.sessionHours)]);
  return token;
}
export const destroySession = (token) => q('DELETE FROM sessions WHERE token_hash=$1', [sha(token)]);

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setSessionCookie(req, res, token) {
  const secure = config.production || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${config.sessionHours * 3600}${secure ? '; Secure' : ''}`);
}
export const clearSessionCookie = (res) => res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');

/** Muat user dari cookie sesi. Tidak menolak; req.user null jika tidak ada. */
export const loadUser = wrap(async (req, _res, next) => {
  req.user = null;
  const token = parseCookies(req.headers.cookie).sid;
  if (token) {
    const row = await one(
      `SELECT u.id,u.username,u.nama,u.nip,u.jabatan,u.role,u.unit_id,u.email, un.nama AS unit_nama
         FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN units un ON un.id=u.unit_id
        WHERE s.token_hash=$1 AND s.expires_at > now() AND u.aktif`,
      [sha(token)],
    );
    if (row) {
      req.user = row;
      req.sessionToken = token;
    }
  }
  next();
});

export function requireAuth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Sesi berakhir. Silakan masuk kembali'));
  next();
}

/**
 * Proteksi CSRF: cookie SameSite=Strict ditambah header kustom pada semua metode yang mengubah data.
 * Header kustom tidak bisa dikirim lintas origin tanpa preflight, dan CORS tidak diaktifkan.
 */
export function csrfGuard(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.headers['x-requested-with'] !== 'surat-app') return next(new HttpError(403, 'Permintaan ditolak (CSRF)'));
  next();
}

/** Pembatas laju sederhana di memori: maks `max` percobaan per `windowMs` per kunci. */
export function limiter({ windowMs, max, key }) {
  const hits = new Map();
  return (req, _res, next) => {
    const k = key(req);
    const now = Date.now();
    const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return next(new HttpError(429, 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi'));
    arr.push(now);
    hits.set(k, arr);
    next();
  };
}
