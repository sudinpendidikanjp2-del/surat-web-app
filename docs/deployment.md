# Deployment produksi (server Linux + Docker)

Arsitektur: reverse proxy (TLS, batas laju) → aplikasi Next.js mandiri (non-root) → PostgreSQL 16. Database hanya ada
di jaringan Docker internal tanpa akses keluar; aplikasi punya akses keluar untuk Gemini dan Google Drive/Sheets.
Berkas: `Dockerfile`, `docker-compose.yml` (+ `docker-compose.image.yml`, `docker-compose.proxy.yml`), `deploy/`.

```
internet ─► reverse proxy :443 ─► app :3000 ─► db :5432 (jaringan internal)
                                     │
                                     └─► internet (Gemini, Google) — opsional
```

## 1. Prasyarat server

- Linux x86_64, 2 vCPU dan 4 GB RAM atau lebih (OCR Tesseract dan LibreOffice memakai memori), disk ≥ 40 GB.
- Docker Engine ≥ 24 dan plugin Compose ≥ 2.24 (`docker compose version`; `!reset` di berkas tambahan membutuhkannya).
- Domain dengan catatan DNS A ke IP server. Firewall hanya membuka 22 (SSH, kunci saja), 80, 443:
  `ufw default deny incoming && ufw allow 22,80,443/tcp && ufw enable`.
- Pembaruan keamanan OS otomatis (`unattended-upgrades`) dan login root SSH dimatikan.

## 2. Pertama kali

```bash
mkdir -p /opt/surat && cd /opt/surat
# Cukup tiga berkas compose + folder deploy/ (atau git clone repo ini bila ingin build sendiri)
cp deploy/env.production.example .env && chmod 600 .env
$EDITOR .env        # APP_URL, POSTGRES_PASSWORD (openssl rand -base64 36), APP_IMAGE, pilihan reverse proxy
docker compose pull && docker compose up -d
docker compose ps                                   # app "healthy"
docker compose logs app | grep "Akun awal"          # bila SEED_PASSWORD kosong, kata sandi acak tampil sekali di sini
```

Masuk sebagai `admin`, ganti kata sandi semua akun bawaan, lalu isi identitas kantor, unit, dan penomoran.

### Image dari GitHub atau build sendiri

- **Image siap jadi (disarankan):** `COMPOSE_FILE=docker-compose.yml:docker-compose.image.yml` dan `APP_IMAGE=ghcr.io/sudinpendidikanjp2-del/surat-web-app:<versi>`.
  Bila repo privat, masuk dulu: `docker login ghcr.io -u <username-github>` dengan *personal access token* (classic) berizin `read:packages`.
- **Build di server:** hapus `COMPOSE_FILE` dan `APP_IMAGE`, lalu `docker compose up -d --build` dari salinan repo.

### Versi image

`.github/workflows/docker-publish.yml` menjalankan seluruh CI, lalu menerbitkan image ke ghcr.io dengan nomor versi yang
naik otomatis dari tag git terakhir. Tag git `vX.Y.Z` dan GitHub Release dibuat hanya setelah CI lolos dan image terbit.

| Cara | Versi berikutnya (dari v2.0.3) |
|---|---|
| push biasa ke `main` atau `breaking-change` | `2.0.4` |
| pesan commit memuat `[minor]` / `[major]` | `2.1.0` / `3.0.0` |
| manual: Actions > Publish Docker image > Run workflow | sesuai pilihan |
| push tag sendiri: `git tag v3.0.0 && git push origin v3.0.0` | `3.0.0` apa adanya |

Tag image: `X.Y.Z`, `X.Y`, nama branch, `sha-xxxxxxx`, dan `latest` (hanya dari `main` atau tag). Kunci server ke nomor
versi agar pembaruan terjadi saat Anda memilihnya. Bukti asal image:
`gh attestation verify oci://ghcr.io/sudinpendidikanjp2-del/surat-web-app:<versi> --repo sudinpendidikanjp2-del/surat-web-app`.

## 3. Reverse proxy

Di dalam container aplikasi **selalu mendengar di port 3000**. `APP_PORT` hanya port di host, dan secara bawaan port itu
dibuka **hanya untuk 127.0.0.1**. Pilih satu:

| Reverse proxy | Atur di `.env` | Arahkan proxy ke |
|---|---|---|
| **Nginx bawaan repo ini** (TLS, batas laju, batas unggah) | `COMPOSE_PROFILES=nginx`, `DOMAIN`, `TLS_DIR` | sudah diatur (`app:3000`) |
| Terpasang langsung di host (Caddy, Nginx, Apache) | tidak perlu | `http://127.0.0.1:3000` (atau `APP_PORT`); contoh `deploy/Caddyfile` |
| Container di jaringan Docker (Nginx Proxy Manager, Traefik) | tambahkan `docker-compose.proxy.yml` ke `COMPOSE_FILE`, isi `PROXY_NETWORK` | `http://surat-app:3000` |
| Mesin lain | `APP_BIND=0.0.0.0` dan batasi port dengan firewall | `http://<ip-server>:<APP_PORT>` |

`TRUST_PROXY=true` (bawaan compose) membuat aplikasi membaca IP klien dari `X-Real-IP` atau entri `X-Forwarded-For`
paling kanan. Itu benar selama klien **tidak** dapat menjangkau port aplikasi secara langsung; bila bisa (mis.
`APP_BIND=0.0.0.0` tanpa firewall), isi `TRUST_PROXY=false`, karena penyerang dapat memalsukan header itu.

Kesalahan yang paling sering: proxy di dalam container diarahkan ke `127.0.0.1:3000` (itu container proxy sendiri), atau
ke `surat-app:<APP_PORT>` padahal di jaringan Docker port-nya selalu 3000. Jangan menghapus `HOSTNAME=0.0.0.0` dari
Dockerfile: tanpa itu server hanya mendengar di alamat ID container, healthcheck *unhealthy*, dan proxy mendapat
*connection refused*.

Proxy lain selain Nginx bawaan perlu: meneruskan `Host`, menimpa `X-Real-IP`, mengirim `X-Forwarded-Proto`, batas isi
permintaan 4 GB dan waktu tunggu 15 menit untuk `/api/cadangan/` (unggah dan pulihkan cadangan), serta 5 menit untuk
`/api/ocr/` dan `/api/letters-out/` (OCR dan PDF).

### Sertifikat TLS (Nginx bawaan)

Sebelum Nginx dinyalakan, selagi port 80 masih bebas:

```bash
docker run --rm -p 80:80 -v /etc/letsencrypt:/etc/letsencrypt certbot/certbot:v3.1.0 \
  certonly --standalone -d surat.contoh.go.id -m admin@contoh.go.id --agree-tos --no-eff-email
docker compose up -d        # dengan COMPOSE_PROFILES=nginx di .env
```

Pembaruan sertifikat (cron harian, mis. `/etc/cron.d/surat-cert`):

```
17 3 * * * root cd /opt/surat && docker compose run --rm certbot renew --webroot -w /var/www/certbot --quiet && docker compose exec -T nginx nginx -s reload
```

## 4. Verifikasi

```bash
docker compose ps                                        # app "healthy"
curl -I  https://surat.contoh.go.id/masuk                # 200; Strict-Transport-Security dan Content-Security-Policy (nonce) ada
curl -s  https://surat.contoh.go.id/readyz               # {"status":"ok"}
docker compose exec app node -e "fetch('http://surat-app:3000/healthz').then(r=>console.log(r.status))"   # bila memakai docker-compose.proxy.yml
```

Coba alur singkat: catat satu surat masuk dengan lampiran, buka tanda terimanya, dan pindai QR dari ponsel (alamatnya
harus memakai `APP_URL`).

## 5. Cadangan

Dua lapis yang saling melengkapi:

1. **Di aplikasi** (Admin > Cadangan Data): arsip lengkap terjadwal, salinan ke Google Drive, dan pemulihan dengan
   cadangan pengaman otomatis. Lihat README bagian Cadangan dan pemulihan.
2. **Dari luar aplikasi** (`deploy/backup.sh`): `pg_dump` format custom + arsip lampiran + `SHA256SUMS` + `MANIFEST.txt`,
   tetap jalan walau aplikasi tidak menyala. Retensi `RETENTION_DAYS` (bawaan 14 hari) dengan minimal `KEEP_MIN` (3)
   cadangan selalu disisakan.

```
# /etc/cron.d/surat-backup
30 1 * * * root cd /opt/surat && BACKUP_DIR=/var/backups/surat deploy/backup.sh >> /var/log/surat-backup.log 2>&1
```

Salin `/var/backups/surat` ke **luar server** (rsync, rclone ke penyimpanan instansi). Uji bulanan, tanpa menyentuh
produksi: `deploy/restore.sh --verify /var/backups/surat/surat-<waktu>` (memulihkan ke database sementara dan
membandingkan jumlah baris tabel inti). Pemulihan nyata: `deploy/restore.sh --yes <folder>` (menghentikan app, menimpa
database dan lampiran, menyalakan kembali; semua pengguna masuk lagi).

## 6. Pembaruan dan rollback

```bash
deploy/deploy.sh      # cadangan → git pull --ff-only (bila ada .git) → tarik image → up -d → tunggu app sehat
```

Dengan image dari ghcr.io, ganti `APP_IMAGE` ke versi baru di `.env` lalu jalankan `deploy/deploy.sh`. Rollback: kembalikan
`APP_IMAGE` ke versi lama (atau `git checkout <commit-lama>` bila build sendiri) lalu `deploy/deploy.sh`. Migrasi skema
bersifat maju dan sejauh ini hanya menambah kolom, tabel, dan indeks, jadi versi lama umumnya tetap berjalan di atas
database yang sudah dimigrasi. Bila tidak, pulihkan cadangan pra-deploy yang dibuat `deploy/deploy.sh` (bagian 5).

## 7. Perintah di dalam container

Image berjalan sebagai pengguna `node` (uid 1000) dengan entrypoint `sisurat`:

```bash
docker compose exec app sisurat reset-password admin                     # kata sandi baru diminta di terminal
docker compose exec -e PASSWORD='kata-sandi-baru' app sisurat reset-password admin
docker compose exec app sisurat sh
```

`reset-password` mengaktifkan kembali akun itu, mengakhiri semua sesinya, dan mencatatnya di Catatan Kegiatan.

**Folder host sebagai pengganti volume** (`- /srv/surat:/data`): folder itu harus milik uid 1000
(`chown -R 1000:1000 /srv/surat`). Bila tidak dapat diubah, jalankan container sebagai root agar entrypoint memperbaikinya
lalu turun ke `node`; karena compose memakai `cap_drop: ALL`, kemampuan yang dibutuhkan harus dikembalikan:

```yaml
services:
  app:
    user: "0"
    cap_add: [CHOWN, FOWNER, DAC_OVERRIDE, SETUID, SETGID]
```

## 8. Catatan

- Satu instance aplikasi: pembatas laju dan pengingat berjalan di memori proses. Untuk beberapa instance, pindahkan
  pembatas laju ke penyimpanan bersama dan jalankan pengingat di satu instance saja (notifikasi sudah idempoten).
- Image memasang LibreOffice untuk PDF surat keluar, sehingga cukup besar. Hapus baris `apt-get` di `Dockerfile` bila
  PDF tidak dibutuhkan (DOCX tetap dapat diunduh).
