import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { rateLimited } from '@/domain/errors';
import type { PasswordHasher, RateLimiter, SessionTokens } from '@/server/application/ports';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

/** scrypt dengan garam acak per kata sandi. Format: scrypt$garam$kunci (hex). */
export const scryptPasswords: PasswordHasher = {
  async hash(pw) {
    const salt = crypto.randomBytes(16);
    const key = await scrypt(pw, salt, 64);
    return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
  },
  async verify(pw, stored) {
    const [alg, saltHex, keyHex] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(keyHex, 'hex');
    const key = await scrypt(pw, Buffer.from(saltHex, 'hex'), expected.length);
    return expected.length > 0 && key.length === expected.length && crypto.timingSafeEqual(key, expected);
  },
};

/** Token sesi acak; yang disimpan di database hanya hash SHA-256-nya. */
export const randomTokens: SessionTokens = {
  create: (bytes = 32) => crypto.randomBytes(bytes).toString('base64url'),
  hash: (token) => crypto.createHash('sha256').update(token).digest('hex'),
};

/** Pembatas laju di memori: maks `max` percobaan per `windowMs` per kunci. Cukup untuk satu proses. */
export function memoryLimiter(): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    hit(key, windowMs, max) {
      const now = Date.now();
      const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
      if (arr.length >= max) throw rateLimited();
      arr.push(now);
      hits.set(key, arr);
      if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    },
  };
}
