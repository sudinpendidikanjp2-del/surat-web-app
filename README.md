# Sistem Surat dan Disposisi

Aplikasi web untuk mengelola siklus hidup surat: surat masuk, registrasi, disposisi, penugasan, tindak lanjut, konfirmasi, surat keluar dari template DOCX, persetujuan, penomoran otomatis, sampai arsip. Dibuat dari PRD "Sistem Manajemen Surat, Disposisi, Tindak Lanjut dan Persuratan" (versi 1.0).

Konsep utama: satu surat masuk adalah satu **urusan (case)**. Disposisi, tugas, dokumen, komentar, surat balasan, dan konfirmasi menempel pada urusan itu dan tercatat di satu garis waktu.

## Teknologi

- Frontend: Vite, React 18, React Router, TanStack Query, Motion (pegas).
- Backend: Node.js 22, Express.
- Database: PostgreSQL 16, SQL langsung lewat `pg` (skema di `server/src/db.js`).
- DOCX: docxtemplater dan PizZip (placeholder `{{nama_field}}`), pratinjau dengan mammoth, PDF lewat LibreOffice (`soffice`) bila terpasang.

Catatan deviasi dari PRD: PRD menyebut Prisma. Versi ini memakai `pg` dengan SQL langsung agar tidak bergantung pada unduhan mesin Prisma. Skema memakai SQL standar dan mudah dipindah ke Prisma.

## Menjalankan

Prasyarat: Node 22 atau lebih baru, PostgreSQL, dan (opsional, untuk unduh PDF) LibreOffice.

```bash
createdb surat   # atau sesuaikan DATABASE_URL
npm install
npm run build              # membangun frontend ke client/dist
DATABASE_URL=postgres://surat:surat_dev@localhost:5432/surat npm start
```

Buka http://localhost:3000. Saat database kosong, server membuat tabel, unit, akun awal, pengaturan, dan lima template bawaan.

Pengembangan: jalankan `npm run dev:server` dan `npm run dev:client` di dua terminal (Vite memproksikan `/api` ke port 3000; ubah dengan `API_URL`).

Data contoh (opsional, perihal diawali `[CONTOH]`): jalankan server, lalu `npm run seed:demo`.

Uji: `npm test` (membuat ulang database `surat_test`; butuh hak membuat database).

## Akun awal

Kata sandi awal semua akun: `surat12345` (ubah lewat `SEED_PASSWORD` sebelum pertama jalan, dan ganti setelah masuk).

| Nama pengguna | Peran |
|---|---|
| admin | Super Admin |
| tu | Tata Usaha |
| pimpinan | Pimpinan |
| kasi.data | Pejabat (Seksi Data) |
| andi, budi | Pelaksana (Seksi Data) |
| viewer | Viewer |

Unit awal (Pimpinan, Tata Usaha, Seksi Data) dan nama instansi (`Sudin Pendidikan JP2`, kode nomor `Sudin-JP2`) hanya titik awal. Ubah di menu Unit Kerja dan Pengaturan.

## Cakupan fitur

Sesuai MVP dan sebagian P1 PRD:

- Login, sesi, peran dan izin per aksi, audit log tak terhapus.
- Surat masuk: nomor agenda otomatis (`SM-2026-000125`), unggah scan, tombol teruskan ke pimpinan, SLA dan indikator sisa waktu, kode QR, lembar disposisi cetak.
- Disposisi: ke unit atau pegawai, tindakan, batas waktu, prioritas, terima, teruskan berjenjang, kembalikan dengan alasan.
- Tugas: beberapa tugas per surat, PIC, daftar periksa, progres, status delapan tahap, minta data, lampiran hasil.
- Konfirmasi ke pemberi surat dan syarat penyelesaian (tugas selesai, balasan terkirim, konfirmasi dicatat).
- Surat keluar: generator dari template DOCX, pratinjau, versi dokumen, review, persetujuan (setuju, kembalikan, tolak), penomoran atomik tanpa nomor ganda, unggah dokumen bertanda tangan, catat pengiriman, relasi dua arah dengan surat masuk.
- Template: unggah DOCX, deteksi field otomatis, versi, aktif atau nonaktif, label dan tipe field, pratinjau.
- Dasbor per peran (pimpinan: pusat perhatian dan grafik; TU: antrean; pegawai: pekerjaan saya), notifikasi dalam aplikasi, pengingat H-3, H-1, hari H, terlambat dengan eskalasi, komentar dan `@mention`.
- Pencarian dan filter lanjutan, arsip per tahun, jenis, bulan, laporan dengan ekspor CSV.
- Keamanan: hash scrypt, cookie `HttpOnly` `SameSite=Strict`, header CSRF, pembatas laju login, CSP, validasi ekstensi dan isi file, file di `storage/private` yang hanya terbuka lewat endpoint berizin, kueri berparameter.

## Belum ada (di luar MVP, sesuai fase PRD)

Delegasi kewenangan, persetujuan berjenjang yang dapat dikonfigurasi, kalender, notifikasi email dan browser, PWA dan antrean offline, sinkronisasi Google Drive, OCR dan pencarian isi dokumen, ekspor Excel dan PDF laporan (CSV tersedia), tracking publik, TTE, fitur AI, backup otomatis (gunakan `pg_dump` dan salin folder `storage`).

Unduh PDF surat keluar membutuhkan LibreOffice di server. Tanpa itu, endpoint mengembalikan pesan jelas dan DOCX tetap dapat diunduh.

## Catatan produksi

- Jalankan di belakang HTTPS. Cookie otomatis `Secure` bila `NODE_ENV=production` atau proxy mengirim `X-Forwarded-Proto: https`.
- Pembatas laju login disimpan di memori proses. Untuk beberapa instance, pindahkan ke penyimpanan bersama.
- Pengingat berjalan di dalam proses server. Untuk beberapa instance, jalankan pengingat di satu instance saja (notifikasi sudah idempoten lewat `dedupe_key`).
