#!/usr/bin/env node
/**
 * Persiapan pengembangan lokal sekali jalan: membuat .env.local berisi DATABASE_URL dan pengaturan lokal.
 * File yang sudah ada tidak ditimpa. Dipanggil oleh `npm run setup`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, '.env.local');

const ENV = `# Pengaturan lokal. Dibaca otomatis oleh Next.js (npm run dev / npm start). Tidak ikut ke git.
DATABASE_URL=postgres://surat:surat_dev@localhost:5432/surat
TEST_DATABASE_URL=postgres://surat:surat_dev@localhost:5432/surat_test
# Kata sandi semua akun awal (admin, tu, pimpinan, kasi.data, andi, budi, viewer).
SEED_PASSWORD=surat12345
STORAGE_DIR=./storage/private
SESSION_HOURS=12
`;

if (fs.existsSync(target)) {
  console.log('.env.local sudah ada, tidak diubah.');
} else {
  fs.writeFileSync(target, ENV);
  console.log('.env.local dibuat.');
}
fs.mkdirSync(path.join(root, 'storage', 'private'), { recursive: true });

console.log(`
Langkah berikutnya, pilih salah satu:

  A. Tanpa Docker (paling mudah):
       npm run dev:local
     Database dan aplikasi jalan bersama. Berhenti dengan Ctrl+C.

  B. Dengan Docker:
       npm run db:docker
       npm run dev

Lalu buka http://localhost:3000 dan masuk sebagai admin / surat12345.
Data contoh (opsional, saat aplikasi berjalan, di jendela lain): npm run seed:demo
`);
