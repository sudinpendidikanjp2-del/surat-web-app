# Keamanan

Ringkasan kontrol, di mana ditegakkan, dan bagaimana diuji. Izin selalu diperiksa di use case (server);
`src/proxy.ts` hanya lapisan tambahan.

| Area | Kontrol | Lokasi | Pengujian |
|---|---|---|---|
| Autentikasi | scrypt dengan garam acak, token sesi acak yang disimpan sebagai hash SHA-256, cookie `HttpOnly` `SameSite=Strict`, `Secure` di produksi atau HTTPS | `infrastructure/security/crypto.ts`, `api/auth/login` | integrasi `e2e.test.ts` |
| Tebak kata sandi | Tiga lapis per 10 menit: alamat+akun (10), akun saja (30, walau alamat berganti), alamat saja (50) | `application/auth.ts` | `e2e.test.ts` (X-Forwarded-For palsu tetap tertahan) |
| IP klien | Header proxy hanya dipercaya bila `TRUST_PROXY=true`; `X-Real-IP` lalu entri `X-Forwarded-For` paling kanan; nilai yang bukan IP dibuang | `http/client.ts` | `unit/client.test.ts`, `features.test.ts` |
| Alamat publik | Tautan QR, pelacakan, dan alamat balik OAuth dari `APP_URL`; header `X-Forwarded-Host/Proto` hanya dari proxy tepercaya | `http/client.ts` | `unit/client.test.ts` |
| Otorisasi | Hak per peran dan per surat di use case; pelaksana hanya melihat surat yang ditugaskan | `domain/roles.ts`, `application/*` | `e2e.test.ts`, `data-admin.test.ts` |
| CSRF | Header `X-Requested-With: surat-app` wajib untuk metode selain GET + `SameSite=Strict` | `http/handler.ts` | `e2e.test.ts` |
| CSP | Nonce per permintaan + `strict-dynamic`; tanpa `unsafe-inline`/`unsafe-eval` untuk skrip di produksi; `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'` | `lib/security-headers.ts`, `proxy.ts` | `unit/security-headers.test.ts`, peramban: nol pelanggaran di semua halaman termasuk editor dan OCR |
| Header | HSTS (bila `APP_URL` https), nosniff, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy (kamera hanya situs sendiri), COOP, `X-Robots-Tag: noindex` | `next.config.ts`, `proxy.ts`, Nginx | unit + peramban |
| Batas laju | Nginx (`limit_req` login 5/menit, pelacakan 1/detik) + aplikasi (per akun dan per alamat) | `deploy/nginx`, `application/*` | integrasi |
| Input | Validasi di setiap use case; kueri SQL berparameter; urutan kolom lewat daftar putih | `domain/validation.ts`, `infrastructure/*` | integrasi |
| Konfigurasi | Variabel lingkungan diperiksa saat menyala; pesan galat tanpa nilai | `server/env.ts` | `unit/env.test.ts` |
| Unggahan | Jenis dari ekstensi + isi (magic bytes), batas ukuran, nama berkas dibuat server, anti path traversal, berkas hanya lewat endpoint berizin dengan CSP `sandbox` | `infrastructure/storage/local-files.ts`, `http/responses.ts` | `e2e.test.ts` |
| Isi surat kaya | HTML editor diubah menjadi XML Word lewat daftar elemen yang dikenal; skrip dan tag lain dibuang | `infrastructure/documents/rich-ooxml.ts` | `unit/rich-text.test.ts` |
| Audit | Catatan kegiatan dan garis waktu tidak dapat diubah atau dihapus (trigger database), ikut kembali setelah pemulihan | `db/schema.ts` | `e2e.test.ts`, uji `deploy/restore.sh` |
| Rahasia | Hanya dari environment atau database; `GET /api/settings` hanya mengirim pengaturan umum; kredensial Google tidak pernah dikirim ke peramban | `application/admin.ts`, `application/google.ts` | `google-backup.test.ts` |
| Container | Non-root (uid 1000), `cap_drop: ALL`, `no-new-privileges`, `init`, database di jaringan internal tanpa akses keluar | `Dockerfile`, `docker-compose.yml` | CI smoke test (`id -u` ≠ 0) |
| Dependensi | `npm audit --omit=dev --audit-level=high` di CI, Dependabot mingguan dengan jeda 14 hari, versi dipaku | `.github/*` | CI |

## Risiko yang diterima atau belum ditutup

- `style-src 'unsafe-inline'` tetap diizinkan: dibutuhkan atribut `style` React dan editor Tiptap. Gaya tidak dapat menjalankan kode.
- Pembatas laju aplikasi ada di memori proses: cukup untuk satu instance; untuk beberapa instance pindahkan ke penyimpanan bersama.
- File cadangan (aplikasi maupun `deploy/backup.sh`) tidak dienkripsi dan memuat data pribadi serta kredensial Google yang
  tersimpan. Enkripsi saat disalin keluar server menjadi tanggung jawab operator.
- Tidak ada 2FA. Uji penetrasi pihak ketiga belum dilakukan; disarankan sebelum dipakai luas.
- `npm audit` produksi masih melaporkan temuan tingkat sedang pada `mammoth` dan `exceljs` (lewat `uuid`); belum ada versi
  perbaikan yang kompatibel. `mammoth` hanya membaca DOCX buatan aplikasi atau template yang diunggah admin.
