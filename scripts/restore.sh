#!/usr/bin/env bash
# Pulihkan dari cadangan: ./scripts/restore.sh backups/surat-XXXX.sql.gz backups/storage-XXXX.tar.gz
# PERINGATAN: menimpa data yang ada. Hentikan aplikasi dulu: docker compose stop app
set -euo pipefail
cd "$(dirname "$0")/.."
[ $# -eq 2 ] || { echo "Pemakaian: $0 <sql.gz> <storage.tar.gz>"; exit 1; }
read -r -p "Ini MENIMPA database dan file saat ini. Ketik 'ya' untuk lanjut: " ok
[ "$ok" = "ya" ] || exit 1
docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
gunzip -c "$1" | docker compose exec -T db sh -c 'psql -q -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose run --rm --no-deps -T -u root app sh -c 'rm -rf /data/private && tar -C /data -xzf - && chown -R node:node /data' < "$2"
docker compose start app
