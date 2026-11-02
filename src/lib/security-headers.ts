/**
 * Header keamanan respons. Dipisah dari proxy.ts dan next.config.ts agar dapat diuji sebagai fungsi murni.
 *
 * CSP memakai nonce per permintaan + 'strict-dynamic' (pola sudindikjp2): hanya skrip yang dibawa Next.js (diberi
 * nonce otomatis dari header permintaan) dan skrip tema yang diberi nonce yang boleh berjalan; 'unsafe-inline'
 * TIDAK diizinkan untuk skrip. Gaya inline tetap diizinkan (atribut style React, editor Tiptap, lebar kolom tabel);
 * gaya tidak dapat menjalankan kode.
 */
export interface CspOptions {
  nonce: string;
  /** Mode pengembangan membutuhkan eval dan WebSocket untuk HMR. */
  dev?: boolean;
  /** Tambahkan upgrade-insecure-requests (hanya bila situs dilayani lewat HTTPS). */
  https?: boolean;
}

export function buildCsp({ nonce, dev = false, https = false }: CspOptions): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    // data:/blob: untuk pratinjau foto dan PDF hasil OCR serta ikon aplikasi.
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
    "media-src 'self' blob:",
    "object-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (https) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

/** Nonce acak 128 bit (base64), lewat Web Crypto agar berjalan di runtime proxy mana pun. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Header untuk SEMUA respons, termasuk aset dan API yang tidak lewat proxy (dipasang oleh next.config.ts). */
export const STATIC_SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Kamera untuk memotret surat (OCR) dari halaman ini sendiri; selebihnya mati.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
];

/** Header yang bergantung permintaan atau konfigurasi: CSP bernonce, dan HSTS hanya bila APP_URL https. */
export function dynamicSecurityHeaders({ appUrl, csp }: { appUrl: string; csp: string }): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Security-Policy': csp };
  if (appUrl.startsWith('https://')) headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  return headers;
}
