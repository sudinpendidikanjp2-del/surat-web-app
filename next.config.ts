import type { NextConfig } from 'next';

/**
 * Paket native atau berat (OCR, pengolah gambar, driver database, pembaca DOCX) dijalankan apa adanya di Node,
 * tidak dibundel, agar file biner dan data bahasa Tesseract tetap ditemukan.
 */
const nextConfig: NextConfig = {
  // Image Docker memakai build mandiri (BUILD_STANDALONE=1). Lokal dan uji memakai `next start` biasa.
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  poweredByHeader: false,
  serverExternalPackages: ['sharp', 'tesseract.js', '@tesseract.js-data/ind', '@tesseract.js-data/eng', 'pg', 'mammoth', 'docxtemplater', 'pizzip', 'qrcode'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
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
