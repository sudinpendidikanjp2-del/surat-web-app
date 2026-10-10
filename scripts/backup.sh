#!/usr/bin/env bash
# Cadangan database + file privat. Jalankan dari cron, mis. setiap hari 01:30:
#   30 1 * * * cd /opt/surat-web-app && ./scripts/backup.sh >> /var/log/surat-backup.log 2>&1
# Hasil: backups/surat-<waktu>.sql.gz dan backups/storage-<waktu>.tar.gz. Cadangan lebih dari KEEP_DAYS hari dihapus.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=${BACKUP_DIR:-backups}; KEEP_DAYS=${KEEP_DAYS:-14}
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$OUT"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$OUT/surat-$STAMP.sql.gz"
docker compose exec -T app tar -C /data -czf - private > "$OUT/storage-$STAMP.tar.gz"
find "$OUT" -type f -mtime +"$KEEP_DAYS" -delete
echo "Cadangan selesai: $OUT/*-$STAMP.*"
