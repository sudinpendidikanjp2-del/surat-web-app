#!/usr/bin/env bash
# Siapkan lingkungan uji lokal: database (Docker), dependensi, build.
# Pakai: ./scripts/local-setup.sh   lalu   npm run dev:server  dan  npm run dev:client
# Jika sudah punya PostgreSQL sendiri, lewati Docker: set DATABASE_URL dan jalankan langkah npm saja.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -z "${SKIP_DOCKER:-}" ]; then
  docker compose -f docker-compose.dev.yml up -d --wait
fi
npm install
npm run build
export DATABASE_URL=${DATABASE_URL:-postgres://surat:surat_dev@localhost:5432/surat}
cat <<MSG

Siap. Jalankan:
  npm run dev:server   # API di :3000 (migrasi + akun awal otomatis)
  npm run dev:client   # UI di :5173 (proksi /api ke :3000)
Masuk: admin / surat12345 (juga tu, pimpinan, kasi.data, andi, budi, viewer)
Data contoh (server harus jalan): npm run seed:demo
Uji otomatis: npm test
MSG
