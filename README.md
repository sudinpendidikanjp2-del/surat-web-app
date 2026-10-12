# Sistem Surat dan Disposisi

Aplikasi web untuk mengelola siklus hidup surat: surat masuk, registrasi, disposisi, penugasan, tindak lanjut, konfirmasi, surat keluar dari template DOCX, persetujuan, penomoran otomatis, sampai arsip. Dibuat dari PRD "Sistem Manajemen Surat, Disposisi, Tindak Lanjut dan Persuratan" (versi 1.0).

Konsep utama: satu surat masuk adalah satu **urusan (case)**. Disposisi, tugas, dokumen, komentar, surat balasan, dan konfirmasi menempel pada urusan itu dan tercatat di satu garis waktu.

## Teknologi

- Satu aplikasi Next.js 16 (App Router, React 19, TypeScript): halaman dan API (`src/app/api/**/route.ts`) dalam satu proses.
- Tampilan: Tailwind CSS 4, komponen gaya shadcn/ui (Radix), TanStack Query untuk data, ikon lucide, huruf Atkinson Hyperlegible Next (disajikan sendiri, tanpa layanan luar).
- Database: PostgreSQL 16, SQL langsung lewat `pg` (skema di `src/server/infrastructure/db/schema.ts`).
- OCR: tesseract.js (model bahasa Indonesia, `best_int`) dengan prapengolahan sharp. Opsional: server model OCR jarak jauh (lihat bagian OCR).
- DOCX: docxtemplater dan PizZip (placeholder `{{nama_field}}`), pratinjau dengan mammoth, PDF lewat LibreOffice (`soffice`) bila terpasang.

## Susunan kode (clean architecture)

Ketergantungan hanya mengarah ke dalam:

```
src/domain/                 aturan murni (status, SLA, hak akses, validasi). Dipakai server dan peramban.
src/server/application/     use case + ports (antarmuka repositori dan layanan). Tidak tahu HTTP maupun SQL.
src/server/infrastructure/  implementasi ports: PostgreSQL, penyimpanan file, OCR, DOCX, QR, kripto.
src/server/container.ts     composition root: merangkai implementasi ke use case.
src/server/http/            pembungkus route: sesi, CSRF, galat ke status HTTP.
src/app/api/**/route.ts     adaptor tipis: baca permintaan, panggil satu use case, kirim JSON.
src/features/<fitur>/       halaman per fitur: api.ts (hook React Query) dan komponen halamannya.
src/components/ui/          komponen dasar (shadcn/ui), src/components/app/ komponen bersama aplikasi.
src/app/(app)/              rute halaman yang butuh login, src/app/lacak/ halaman umum pelacakan.
```

Saat server mulai (`src/instrumentation.ts`), migrasi skema dan data awal berjalan, lalu pengingat batas waktu dijadwalkan.

Catatan deviasi dari PRD: PRD menyebut Prisma. Versi ini memakai `pg` dengan SQL langsung agar tidak bergantung pada unduhan mesin Prisma. Skema memakai SQL standar dan mudah dipindah ke Prisma.

## Menjalankan

Prasyarat: Node 22 atau lebih baru, PostgreSQL, dan (opsional, untuk unduh PDF) LibreOffice.

```bash
createdb surat   # atau sesuaikan DATABASE_URL
npm install
npm run build
DATABASE_URL=postgres://surat:surat_dev@localhost:5432/surat npm start
```

Buka http://localhost:3000. Saat database kosong, server membuat tabel, unit, akun awal, pengaturan, dan lima template bawaan.

Pengembangan: `npm run dev` (halaman dan API di port 3000). Next.js membaca `.env` secara otomatis. Pemeriksaan: `npm run lint` dan `npm run typecheck`.

Data contoh (opsional, perihal diawali `[CONTOH]`): jalankan server, lalu `npm run seed:demo`.

Uji: `npm test` (membuat ulang database `surat_test`; butuh hak membuat database).

## Akun awal

Kata sandi awal semua akun: `surat12345` (ubah lewat `SEED_PASSWORD` sebelum pertama jalan, dan ganti setelah masuk).

| Nama pengguna | Peran |
|---|---|
| admin | Admin Sistem |
| tu | Tata Usaha |
| pimpinan | Pimpinan |
| kasi.data | Pejabat (Seksi Data) |
| andi, budi | Pelaksana (Seksi Data) |
| viewer | Pemantau |

Unit awal (Pimpinan, Tata Usaha, Seksi Data) dan nama instansi (`Sudin Pendidikan JP2`, kode nomor `Sudin-JP2`) hanya titik awal. Ubah di Menu Lainnya, Unit Kerja dan Pengaturan Kantor.

## Cakupan fitur

Sesuai MVP dan sebagian P1 PRD:

- Login, sesi, peran dan izin per aksi, audit log tak terhapus.
- Surat masuk: catat dari **foto surat (OCR)** atau manual, nomor agenda otomatis (`SM-2026-000125`), SLA dan indikator sisa waktu, kode QR, lembar disposisi cetak.
- **Pelacakan oleh pengirim** tanpa login (lihat bagian khusus).
- Disposisi: ke unit atau pegawai, tindakan, batas waktu, prioritas, terima, teruskan berjenjang, kembalikan dengan alasan.
- Tugas: beberapa tugas per surat, penanggung jawab, daftar periksa, progres, status delapan tahap, minta data, lampiran hasil.
- Konfirmasi ke pemberi surat dan syarat penyelesaian (tugas selesai, balasan terkirim, konfirmasi dicatat).
- Surat keluar: generator dari template DOCX, pratinjau, versi dokumen, review, persetujuan, penomoran atomik tanpa nomor ganda, unggah dokumen bertanda tangan, catat pengiriman, relasi dua arah dengan surat masuk.
- Template: unggah DOCX, deteksi field otomatis, versi, aktif atau nonaktif, label dan tipe field, pratinjau.
- Beranda per peran dengan daftar "Perlu tindakan Anda", notifikasi, pengingat H-3, H-1, hari H, terlambat dengan eskalasi, komentar dan `@mention`.
- **Daftar data** (surat masuk, surat keluar, pekerjaan, pengguna, pemberitahuan): pencarian dengan tombol Cari, pilihan tampilan berupa tombol besar, halaman di server dengan tombol "Halaman Sebelumnya/Berikutnya", dan keadaan daftar di alamat (tombol Kembali tetap bekerja).
- Aksi massal tetap tersedia di API (`/api/*/bulk/*`, maks 200 data per aksi, kegagalan dilaporkan per data), tetapi sengaja tidak ditampilkan: kotak centang banyak data dan menu aksi massal sulit dipakai pengguna lanjut usia, dan satu langkah salah berdampak ke banyak surat.
- Pencarian lintas surat masuk dan keluar, arsip per tahun, jenis, bulan, laporan dengan ekspor CSV.
- Keamanan: hash scrypt, cookie `HttpOnly` `SameSite=Strict`, header CSRF, pembatas laju, CSP, validasi ekstensi dan isi file, file di `storage/private` yang hanya terbuka lewat endpoint berizin, kueri berparameter, urutan kolom lewat daftar putih, CSV dengan perlindungan injeksi rumus.

## OCR surat masuk dari foto

Surat Masuk, Catat Surat Masuk, lalu Ambil Foto Surat atau Pilih Foto yang Sudah Ada. Foto halaman pertama surat (kamera ponsel atau galeri). Sistem membaca nomor surat, tanggal, perihal, sifat, lampiran, instansi, alamat, dan pengirim. Di layar lebar foto tampil di samping formulir. Isian yang keyakinannya di bawah 85% atau tidak terbaca diberi latar kuning. **Hasil hanyalah usulan: pengguna wajib memeriksa lalu menyimpan sendiri.**

Pipeline: koreksi orientasi EXIF, ubah ke 2400 px, ratakan pencahayaan, pangkas tepi kertas, hilangkan derau, luruskan kemiringan, binarisasi, lalu Tesseract (bahasa Indonesia). Teks diurai dengan aturan khusus surat dinas (perbaikan salah baca angka romawi, 0 dan O, 1 dan l, nama bulan yang salah baca). Bila hasil pertama kurang lengkap, dicoba dua pemetaan lain dan diambil yang terbaik. Satu foto dibatasi 45 detik.

### Akurasi

Diukur dengan `scripts/ocr/gen-ocr-corpus.py` (membuat surat sintetis beserta kunci jawaban) dan `npm run bench:ocr` (`scripts/ocr/bench-ocr.test.ts`). Hasil terakhir ada di bagian "Hasil pengukuran" di bawah. Catatan jujur: korpus sintetis memakai satu keluarga huruf dan tata letak surat dinas yang rapi, sehingga **akurasi pada surat sungguhan dapat lebih rendah**, terutama untuk cap tumpang tindih, tulisan tangan, kop berwarna, dan foto miring atau berbayang berat. Karena itu sistem menandai isian yang kurang yakin dan tidak pernah menyimpan otomatis. Untuk mengukur pada surat Anda sendiri, taruh foto dan kunci jawabannya dalam format `truth.json` yang sama lalu jalankan `OCR_CORPUS=<folder> npm run bench:ocr`.

### Hasil pengukuran

Korpus sintetis: 30 surat dinas (8 isian utama per surat: nomor surat, tanggal, instansi, alamat, perihal, sifat, lampiran, pengirim), masing-masing dalam tiga kondisi. Akurasi = isian yang cocok persis dengan kunci jawaban (tanpa membedakan huruf besar kecil dan spasi). Dijalankan pada CPU biasa, sekitar 3 detik per foto.

| Kondisi | Contoh | Akurasi isian | Kemiripan karakter | Salah dan tidak ditandai |
|---|---|---|---|---|
| A: pindaian bersih | PNG 1654 px | **99,2%** | 100,0% | 0 dari 2 salah |
| B: foto ponsel baik | JPEG 2300 px, miring sampai 2 derajat, bayangan, sedikit buram dan berderau | **97,9%** | 99,5% | 0 dari 5 salah |
| C: foto buruk | 1250 px, miring sampai 4 derajat, buram, berderau, JPEG kualitas 45 (10 surat) | 16,3% | 26,9% | 2 dari 67 salah |

Kesimpulan jujur: untuk foto jelas dan lurus, di atas 90% dan hampir semua kesalahan yang tersisa ditandai kuning (kurang yakin) sehingga terlihat oleh pemeriksa. Untuk foto buruk, mesin ini **tidak** mencapai 90%; sistem memperingatkan di awal ("foto berderau", "resolusi rendah", "belum terbaca: ...") dan hampir semua kesalahan tetap ditandai. Pengukuran pada surat sungguhan belum dilakukan.

### Mesin OCR model (opsional)

[baidu/Unlimited-OCR](https://github.com/baidu/Unlimited-OCR) (MIT) adalah model parsing dokumen (berbasis DeepSeek-OCR) yang dapat dijalankan sendiri dengan vLLM atau SGLang. Aplikasi ini dapat memakainya sebagai mesin pengganti: jalankan modelnya di server GPU NVIDIA, lalu set

```
OCR_ENGINE=remote
OCR_URL=http://alamat-server-gpu:10000
OCR_MODEL=Unlimited-OCR        # nama model pada server
OCR_FALLBACK=on                # bila server mati, jatuh ke Tesseract
# parameter tambahan sesuai server, mis. SGLang: OCR_EXTRA_JSON={"images_config":{"image_mode":"base"}}
```

Aplikasi mengirim foto dan perintah `document parsing.` ke `/v1/chat/completions`, lalu mengurai keluaran Markdown dengan penguraian yang sama. Model ini tidak memberi skor keyakinan per baris, jadi pemeriksaan manual tetap wajib. **Belum diuji dengan model aslinya di lingkungan ini (tidak ada GPU)**; adaptor diuji dengan server tiruan. Ukur dahulu dengan `npm run bench:ocr` pada data surat Anda sebelum memutuskan memakainya.

## Pelacakan progres oleh pengirim surat

Halaman publik `/lacak` (tanpa login) agar pengirim dapat memantau suratnya. Dipilih **kode acak 100 bit**, bukan nomor surat atau nomor agenda, karena nomor mudah ditebak. Kode ditampilkan sebagai `7K2M-9QXA-4TBD-H3WN-5RFP` dan dapat dibuka lewat tautan `/lacak/<kode>` atau diketik di `/lacak`.

- Tersedia di halaman surat masuk, bagian "Yang juga bisa Anda lakukan", Pelacakan oleh Pengirim (TU, admin, dan pimpinan melihat; hanya TU dan admin dapat menonaktifkan atau membuat ulang kode).
- Pengirim hanya melihat nomor surat milik mereka sendiri, enam tahapan umum dengan tanggal, dan tanggal pembaruan. Tidak ada perihal, nama pegawai, instruksi, atau catatan internal.
- Pembatas laju 30 percobaan per 10 menit per alamat IP. Kode salah, dinonaktifkan, atau kedaluwarsa memberi jawaban yang sama persis.
- Surat berstatus Rahasia: pelacakan mati secara bawaan.
- Kedaluwarsa otomatis 30 hari setelah surat selesai. Kode dapat dibuat ulang kapan saja (kode lama langsung mati).
- Respons `no-store`, `noindex`, tanpa referrer.

## Belum ada (di luar MVP, sesuai fase PRD)

Delegasi kewenangan, persetujuan berjenjang yang dapat dikonfigurasi, kalender, notifikasi email dan browser, PWA dan antrean offline, sinkronisasi Google Drive, pencarian isi dokumen, ekspor Excel dan PDF laporan (CSV tersedia), TTE, fitur AI, backup terkelola di luar server (skrip `scripts/backup.sh` tersedia).

Unduh PDF surat keluar membutuhkan LibreOffice di server. Tanpa itu, endpoint mengembalikan pesan jelas dan DOCX tetap dapat diunduh.

## Uji lokal dengan database siap pakai

Cara tercepat (butuh Docker dan Node 22):

```bash
./scripts/local-setup.sh        # PostgreSQL di Docker (db surat dan surat_test), npm install, build
npm run dev                     # aplikasi :3000, migrasi dan akun awal otomatis
npm run seed:demo               # opsional, saat server jalan: isi data contoh
npm test                        # 17 uji backend (membuat db uji sendiri)
```

Tanpa Docker: pakai PostgreSQL sendiri, buat role `surat` dengan hak `CREATEDB`, lalu `SKIP_DOCKER=1 ./scripts/local-setup.sh`. Atur `DATABASE_URL` dan `TEST_DATABASE_URL` bila nama/sandi berbeda. Masuk dengan `admin` / `surat12345`.

## Deploy produksi (Docker)

```bash
cp .env.example .env            # isi POSTGRES_PASSWORD (wajib) dan SEED_PASSWORD
docker compose up -d --build    # app :3000 (hanya 127.0.0.1) + PostgreSQL 16, data di volume
docker compose logs app | grep "Akun awal"   # bila SEED_PASSWORD kosong, kata sandi acak tampil di sini
```

1. Taruh HTTPS di depan aplikasi. Contoh Caddy (sertifikat otomatis) ada di `deploy/Caddyfile`. Cookie sesi bertanda `Secure`, jadi login hanya jalan lewat HTTPS (localhost dikecualikan oleh peramban).
2. Masuk sebagai `admin`, ganti kata sandi semua akun bawaan, lalu ubah nama instansi, unit, dan pengaturan penomoran.
3. Cadangan harian: `./scripts/backup.sh` (database dan file privat, simpan 14 hari). Jadwalkan dengan cron. Pulihkan dengan `./scripts/restore.sh`. Coba pulihkan di mesin lain sebelum mengandalkannya.
4. Pemantauan: `GET /healthz` (proses hidup) dan `GET /readyz` (database terjangkau). Image punya HEALTHCHECK bawaan.
5. Pembaruan: `git pull && docker compose up -d --build`. Migrasi skema berjalan otomatis saat start.
6. Image memasang LibreOffice (untuk PDF), sehingga cukup besar. Hapus baris `apt-get` di `Dockerfile` bila PDF tidak dibutuhkan.

CI (`.github/workflows/ci.yml`) menjalankan lint, typecheck, build, dan seluruh uji dengan PostgreSQL, serta membangun image Docker.

Belum teruji di lingkungan pengembangan saya: `docker build` dan `docker compose` (tidak ada daemon Docker di sana). Server diuji langsung dengan `NODE_ENV=production`: kata sandi acak, `/healthz`, `/readyz`, cookie Secure, dan header keamanan. Jalankan build pertama di server Anda dan periksa `docker compose ps` menunjukkan `healthy`.

## Catatan produksi

- Jalankan di belakang HTTPS. Cookie otomatis `Secure` bila `NODE_ENV=production` atau proxy mengirim `X-Forwarded-Proto: https`.
- Pembatas laju login disimpan di memori proses. Untuk beberapa instance, pindahkan ke penyimpanan bersama.
- Pengingat berjalan di dalam proses server. Untuk beberapa instance, jalankan pengingat di satu instance saja (notifikasi sudah idempoten lewat `dedupe_key`).
