import type { NextConfig } from 'next';
import { STATIC_SECURITY_HEADERS } from './src/lib/security-headers';

/**
 * Paket native atau berat (OCR, pengolah gambar, driver database, pembaca DOCX) dijalankan apa adanya di Node,
 * tidak dibundel, agar file biner dan data bahasa Tesseract tetap ditemukan.
 */
const nextConfig: NextConfig = {
  // Image Docker memakai build mandiri (BUILD_STANDALONE=1). Lokal dan uji memakai `next start` biasa.
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  poweredByHeader: false,
  // Jangan membuat AGENTS.md otomatis saat `next dev`.
  agentRules: false,
  // Data bahasa Tesseract dan WASM MuPDF (PDF ke gambar) dibaca dari disk saat berjalan, jadi ikut disalin ke build mandiri.
  outputFileTracingIncludes: {
    // pdfkit membaca file metrik huruf (.afm) dari foldernya sendiri saat membuat PDF ekspor.
    '/api/**': ['./node_modules/pdfkit/js/data/**'],
    '/api/ocr/**': ['./node_modules/@tesseract.js-data/ind/4.0.0_best_int/**', './node_modules/tesseract.js/**', './node_modules/tesseract.js-core/**', './node_modules/mupdf/dist/**'],
  },
  serverExternalPackages: ['sharp', 'tesseract.js', '@tesseract.js-data/ind', '@tesseract.js-data/eng', 'pg', 'mammoth', 'docxtemplater', 'pizzip', 'qrcode', 'mupdf', 'pdfkit', 'exceljs'],
  reactStrictMode: true,
  // CSP bernonce dipasang per permintaan oleh src/proxy.ts; di sini hanya header yang sama untuk semua respons.
  async headers() {
    return [
      { source: '/:path*', headers: STATIC_SECURITY_HEADERS },
      // Seluruh aplikasi berisi data surat dan pegawai: jangan disimpan cache bersama atau diindeks mesin pencari.
      { source: '/((?!_next/static|lacak).*)', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ];
  },
};

export default nextConfig;
