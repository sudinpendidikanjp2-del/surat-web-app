# Runbook operasional

Gejala → periksa → tindakan, untuk petugas teknis. Perintah dijalankan dari folder proyek di server.

| Gejala | Periksa | Tindakan |
|---|---|---|
| Situs tidak terbuka | `docker compose ps`; `curl -I https://<domain>/masuk` | Reverse proxy mati: lihat log proxy (sertifikat kedaluwarsa?). `app` tidak sehat: `docker compose logs --tail=100 app` |
| App berhenti saat menyala dengan "Konfigurasi environment tidak valid" | Baris di bawah pesan itu | Perbaiki variabel yang disebut di `.env`, lalu `docker compose up -d`. Pesan tidak memuat nilainya |
| 502 / connection refused dari proxy | `docker compose ps app`; [docs/deployment.md](deployment.md) bagian Reverse proxy | Proxy salah alamat (127.0.0.1 dari dalam container, atau port selain 3000 di jaringan Docker). `docker compose restart app` bila sekadar macet |
| Semua pengguna terkena "Terlalu banyak percobaan" bersamaan | `TRUST_PROXY` dan header proxy | Proxy tidak meneruskan `X-Real-IP`/`X-Forwarded-For`, sehingga semua orang berbagi satu ember. Perbaiki proxy (Nginx bawaan sudah benar) |
| QR atau tautan pelacakan menunjuk alamat salah | `APP_URL` di `.env` | Isi `APP_URL` dengan alamat publik, `docker compose up -d`. Kode QR lama tetap memakai alamat lama |
| Hubungkan Google gagal "redirect_uri_mismatch" | Alamat pengalihan di halaman Google Drive & Sheets | Daftarkan alamat itu di Google Cloud Console; pastikan `APP_URL` sama dengan alamat yang dibuka pengguna |
| Unggah lampiran atau OCR gagal | Pesan di layar; `docker compose exec app df -h /data` | Disk penuh: bersihkan atau tambah disk. Berkas lebih dari `MAX_UPLOAD_MB` ditolak |
| PDF surat keluar tidak tersedia | `docker compose exec app sh -c 'command -v soffice'` | Image tanpa LibreOffice; DOCX tetap tersedia |
| Lupa kata sandi admin | Catatan Kegiatan `LOGIN_GAGAL` | `docker compose exec app sisurat reset-password admin` |
| Cadangan otomatis tidak dibuat | Admin > Cadangan Data (status terakhir); `docker compose logs app \| grep -i cadangan` | Periksa ruang disk `/data/backups` dan jadwal. Pastikan `JOBS` tidak `off` |
| Cadangan cron gagal | `/var/log/surat-backup.log` | Biasanya `db` mati atau disk penuh. Jalankan `deploy/backup.sh` manual untuk melihat galatnya |
| Disk hampir penuh | `docker system df`, `du -sh /var/backups/surat`, Admin > Cadangan Data | `docker image prune -f`; kurangi jumlah cadangan yang disimpan; pindahkan cadangan keluar |
| Migrasi gagal saat menyala | `docker compose logs app` | Jangan hapus data. Perbaiki penyebab (mis. koneksi DB), `docker compose up -d`. Bila data rusak, pulihkan cadangan pra-deploy |
| Dugaan akun diretas | Catatan Kegiatan, log proxy | Nonaktifkan akun, `sisurat reset-password`, ganti `POSTGRES_PASSWORD` bila perlu, putuskan dan hubungkan ulang Google, lapor sesuai prosedur |

## Pemeliharaan berkala

- Mingguan: tinjau PR Dependabot; setelah CI hijau, pilih versi image baru dan jalankan `deploy/deploy.sh`.
- Bulanan: `deploy/restore.sh --verify` pada cadangan terbaru; periksa ruang disk; tinjau Catatan Kegiatan untuk aksi sensitif
  (`CADANGAN_DIPULIHKAN`, `KATA_SANDI_DIATUR_ULANG`, `GOOGLE_*`).
- Per kuartal: perbarui image dasar bila build sendiri (`docker compose build --pull`); ganti kata sandi database bila kebijakan mengharuskan.
- Tahunan: latihan pemulihan penuh ke server kosong dari cadangan di luar server.

## Pemantauan minimal

- Uptime eksternal ke `https://<domain>/readyz` (menguji koneksi database).
- Peringatan disk > 80% dan kegagalan cron cadangan.
- `docker compose ps` sehat untuk `app` (healthcheck bawaan image).
