import fs from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';
import { STATIC_SECURITY_HEADERS } from './src/lib/security-headers';

/**
 * Paket native atau berat (OCR, pengolah gambar, driver database, pembaca DOCX) dijalankan apa adanya di Node,
 * tidak dibundel, agar file biner dan data bahasa Tesseract tetap ditemukan.
 */
/**
 * Seluruh dependensi sebuah paket (rekursif) sebagai pola berkas untuk outputFileTracingIncludes.
 * tesseract.js menjalankan OCR di worker thread yang dimuat lewat path berkas, sehingga pelacak berkas Next.js tidak
 * melihat require() di dalamnya (bmp-js, zlibjs, idb-keyval, wasm-feature-detect, ...) dan build mandiri kehilangan
 * modul itu: "Cannot find module 'bmp-js'". Daftarnya dibaca dari package.json agar tetap benar saat versinya berubah.
 */
function packageClosure(name: string, seen = new Set<string>()): string[] {
  if (seen.has(name)) return [];
  seen.add(name);
  const manifest = path.join(process.cwd(), 'node_modules', name, 'package.json');
  if (!fs.existsSync(manifest)) return [];
  const deps = Object.keys(JSON.parse(fs.readFileSync(manifest, 'utf8')).dependencies ?? {});
  return [`./node_modules/${name}/**`, ...deps.flatMap((d) => packageClosure(d, seen))];
}

const nextConfig: NextConfig = {
  // Image Docker memakai build mandiri (BUILD_STANDALONE=1). Lokal dan uji memakai `next start` biasa.
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  poweredByHeader: false,
  // Jangan membuat AGENTS.md otomatis saat `next dev`.
  agentRules: false,
  // Data bahasa Tesseract dan WASM MuPDF (PDF ke gambar) dibaca dari disk saat berjalan, jadi ikut disalin ke build mandiri.
  outputFileTracingIncludes: {
    // pdfkit membaca file metrik huruf (.afm) dari foldernya sendiri saat membuat PDF ekspor.
    // OCR dipanggil dari use case bersama, jadi disertakan untuk semua rute API (berkas yang sama hanya disalin sekali).
    '/api/**': ['./node_modules/pdfkit/js/data/**', './node_modules/@tesseract.js-data/ind/4.0.0_best_int/**', ...packageClosure('tesseract.js'), './node_modules/mupdf/dist/**'],
  },
  serverExternalPackages: ['sharp', 'tesseract.js', '@tesseract.js-data/ind', '@tesseract.js-data/eng', 'pg', 'mammoth', 'docxtemplater', 'pizzip', 'qrcode', 'mupdf', 'pdfkit', 'exceljs'],
  reactStrictMode: true,
  // CSP bernonce dipasang per permintaan oleh src/proxy.ts; di sini hanya header yang sama untuk semua respons.
  async headers() {
    return [
      { source: '/:path*', headers: STATIC_SECURITY_HEADERS },
      // Seluruh aplikasi berisi data surat dan pegawai: jangan diindeks mesin pencari (kecuali halaman umum dan hukum).
      { source: '/((?!_next/static|lacak|policy|tos).*)', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ];
  },
};

export default nextConfig;
