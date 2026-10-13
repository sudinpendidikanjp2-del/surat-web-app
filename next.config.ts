import type { NextConfig } from 'next';

/**
 * Paket native atau berat (OCR, pengolah gambar, driver database, pembaca DOCX) dijalankan apa adanya di Node,
 * tidak dibundel, agar file biner dan data bahasa Tesseract tetap ditemukan.
 */
const dev = process.env.NODE_ENV !== 'production';
/** Next.js menyisipkan skrip sebaris untuk hidrasi, jadi script-src perlu 'unsafe-inline'. Sumber luar tidak diizinkan sama sekali. */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  // Image Docker memakai build mandiri (BUILD_STANDALONE=1). Lokal dan uji memakai `next start` biasa.
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  poweredByHeader: false,
  // Jangan membuat AGENTS.md otomatis saat `next dev`.
  agentRules: false,
  // Data bahasa Tesseract dibaca dari disk saat berjalan, jadi ikut disalin ke build mandiri.
  outputFileTracingIncludes: {
    '/api/ocr/**': ['./node_modules/@tesseract.js-data/ind/4.0.0_best_int/**', './node_modules/tesseract.js/**', './node_modules/tesseract.js-core/**'],
  },
  serverExternalPackages: ['sharp', 'tesseract.js', '@tesseract.js-data/ind', '@tesseract.js-data/eng', 'pg', 'mammoth', 'docxtemplater', 'pizzip', 'qrcode'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
