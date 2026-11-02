# ADR 0001: Arsitektur dan deployment

- Status: Diterima
- Tanggal: 2 November 2026

## Konteks

Aplikasi dikelola tim kecil di kantor pemerintah dan dipasang di server milik instansi. Repo sudindikjp2 (portal berita
instansi yang sama) sudah memiliki pola penulisan kode, pengujian, dan deployment yang teruji. Keputusan ini mencatat
pola mana yang diambil dan mana yang sengaja tidak.

## Keputusan

### Diambil dari sudindikjp2

- **Konfigurasi divalidasi** satu kali saat server menyala, dengan pesan yang tidak memuat nilai (`src/server/env.ts`).
- **IP klien hanya dari proxy tepercaya** (`TRUST_PROXY`, `X-Real-IP`, entri `X-Forwarded-For` paling kanan) dan
  **alamat publik dari `APP_URL`**. Sebelumnya entri paling kiri `X-Forwarded-For` dipercaya tanpa syarat, sehingga batas
  percobaan login dapat ditembus dengan mengganti header.
- **CSP bernonce + `strict-dynamic`** lewat `proxy.ts`, header statis di `next.config.ts`, fungsi murni yang diuji.
- **Uji terpisah**: `npm test` (unit, tanpa database) dan `npm run test:integration` (server hasil build + PostgreSQL).
- **ESLint lebih ketat**: `consistent-type-imports`, `eqeqeq`, `no-console`, dan batas lapisan (domain dan use case tidak
  boleh mengimpor infrastruktur, konfigurasi, `pg`, Next.js, atau React).
- **CI**: izin minimum, pembatalan run lama, batas waktu, `npm audit --omit=dev`, shellcheck, validasi compose, smoke test
  image non-root. Dependabot mingguan dengan jeda 14 hari (aturan repo: tidak memakai rilis yang lebih muda dari dua minggu).
- **Container**: image non-root, `init`, `cap_drop: ALL`, `no-new-privileges`, database di jaringan internal, Nginx dengan
  batas laju dan TLS, skrip `deploy/` (cadangan dengan checksum, `--verify` ke database sementara, deploy yang menunggu sehat).
- **Dokumentasi** di `docs/`: deployment, runbook operasional, keamanan, ADR.

### Sengaja tidak diambil

- **Prisma dan layanan `migrate` terpisah.** Aplikasi ini memakai SQL langsung (`pg`) dengan migrasi idempoten yang
  berjalan saat server menyala di bawah satu kunci advisory. Mengganti ORM tidak menambah keamanan dan berisiko besar
  pada data yang sudah ada.
- **Worker scheduler terpisah.** Pengingat, cadangan harian, dan sinkronisasi Google berjalan di proses aplikasi. Untuk
  satu instance ini cukup; bila nanti diskalakan, pindahkan ke worker dengan klaim `SKIP LOCKED` seperti sudindikjp2.
- **Jaringan internal penuh untuk aplikasi.** Berbeda dengan portal berita, aplikasi ini perlu akses keluar (Gemini,
  Google Drive/Sheets), jadi hanya database yang berada di jaringan `internal: true`.
- **Prettier dan format ulang seluruh repo.** Gaya kode repo ini (kutip tunggal, baris panjang) sudah konsisten dan dijaga
  ESLint; format ulang massal membuat riwayat `git blame` tidak terbaca. Dapat ditambahkan terpisah bila diinginkan.
- **Uji peramban Playwright di CI.** Pemeriksaan tampilan dan CSP saat ini dijalankan manual dengan Playwright; menjadikannya
  suite CI adalah langkah berikutnya.

## Konsekuensi

- IP klien kini hanya dibaca dari header proxy bila `TRUST_PROXY=true`. Compose mengisinya `true` karena port aplikasi
  bawaannya hanya terbuka untuk 127.0.0.1 atau jaringan proxy; menjalankan `npm start` langsung memakai `false`.
- Container root yang memasang folder host milik root perlu `cap_add` yang disebut di `docs/deployment.md`.
- `scripts/backup.sh` dan `scripts/restore.sh` diganti `deploy/backup.sh` dan `deploy/restore.sh` (format berbeda:
  `pg_dump` custom + checksum).
