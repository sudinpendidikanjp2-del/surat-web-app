#!/usr/bin/env bash
# Cadangan database + lampiran ke satu folder bertanggal, dengan checksum dan pemeriksaan dump.
# Pelengkap cadangan di aplikasi (Admin > Cadangan Data): yang ini berjalan dari luar aplikasi, cocok untuk cron.
#
#   deploy/backup.sh                                          # mode docker, dari folder proyek
#   BACKUP_DIR=/var/backups/surat RETENTION_DAYS=14 deploy/backup.sh
#   BACKUP_MODE=host DATABASE_URL=... STORAGE_DIR=... deploy/backup.sh
#
# Jadwalkan harian lewat cron (contoh di docs/deployment.md). Salin hasilnya ke LUAR server.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib.sh
. "$here/lib.sh"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
KEEP_MIN="${KEEP_MIN:-3}"

require_tools
umask 077
mkdir -p "$BACKUP_DIR"
stamp="$(date '+%Y%m%d-%H%M%S')"
final="$BACKUP_DIR/surat-$stamp"
work="$BACKUP_DIR/.tmp-$stamp-$$"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work"

log "Dump database…"
db_dump > "$work/db.dump"
[ -s "$work/db.dump" ] || die "dump database kosong."

# Daftar isi dump harus terbaca dan memuat tabel inti: menangkap berkas rusak atau database yang salah.
if [ "$MODE" = docker ]; then
  dc exec -T db pg_restore --list < "$work/db.dump" > "$work/db.list" || die "dump tidak dapat dibaca."
else
  pg_restore --list "$work/db.dump" > "$work/db.list" || die "dump tidak dapat dibaca."
fi
for t in letters_in users; do
  grep -q "TABLE DATA public $t " "$work/db.list" || die "dump tidak memuat tabel $t."
done

log "Arsip lampiran…"
storage_archive > "$work/storage.tar.gz"
tar -tzf "$work/storage.tar.gz" > "$work/storage.list" || die "arsip lampiran rusak."

{
  echo "dibuat: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo "mode: $MODE"
  echo "tabel_dump: $(grep -c 'TABLE DATA' "$work/db.list")"
  echo "berkas_lampiran: $(grep -vc '/$' "$work/storage.list" || true)"
} > "$work/MANIFEST.txt"
rm -f "$work/db.list" "$work/storage.list"
(cd "$work" && sha256sum db.dump storage.tar.gz MANIFEST.txt > SHA256SUMS)

mv "$work" "$final"
trap - EXIT
log "Cadangan selesai: $final ($(du -sh "$final" | cut -f1))"

# Retensi: hapus cadangan lebih tua dari RETENTION_DAYS, tetapi selalu sisakan KEEP_MIN terbaru.
mapfile -t all < <(find "$BACKUP_DIR" -maxdepth 1 -type d -name 'surat-*' | sort -r)
if [ "${#all[@]}" -gt "$KEEP_MIN" ]; then
  for old in "${all[@]:$KEEP_MIN}"; do
    if [ -n "$(find "$old" -maxdepth 0 -mtime "+$RETENTION_DAYS" -print)" ]; then
      log "Hapus cadangan lama: $old"
      rm -rf "$old"
    fi
  done
fi
