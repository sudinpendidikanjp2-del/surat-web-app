import crypto from 'node:crypto';

// Alfabet Crockford base32: tanpa I, L, O, U agar mudah dibaca dan diketik.
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Kode pelacakan 20 karakter = 100 bit acak. Tidak dapat ditebak, tidak memuat info surat. */
export function newTrackCode() {
  const bytes = crypto.randomBytes(20);
  let out = '';
  for (let i = 0; i < 20; i++) out += ALPHA[bytes[i] % 32];
  return out;
}
export const formatTrackCode = (c) => (c || '').match(/.{1,4}/g)?.join('-') || '';

/** Terima kode berformat, tanpa tanda hubung, atau tautan penuh. Mengembalikan 20 karakter atau null. */
export function normalizeTrackCode(input) {
  let s = String(input || '').trim();
  const m = s.match(/\/lacak\/([^/?#\s]+)/i);
  if (m) s = m[1];
  s = s.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return /^[0-9A-HJKMNP-TV-Z]{20}$/.test(s) ? s : null;
}
