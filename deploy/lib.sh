#!/usr/bin/env bash
# Fungsi bersama backup.sh / restore.sh / deploy.sh.
#
# Mode "docker" (bawaan): dijalankan dari folder proyek di server; memakai `docker compose`.
#   COMPOSE_ENV_FILE      berkas env compose (bawaan: .env di folder proyek)
# Mode "host": tanpa Docker; memakai pg_dump/pg_restore lokal.
#   BACKUP_MODE=host DATABASE_URL=postgres://... STORAGE_DIR=/path
set -euo pipefail

MODE="${BACKUP_MODE:-docker}"
# Tabel yang jumlah barisnya dibandingkan saat verifikasi; harus ada di setiap cadangan yang sah.
TABLES=(users units letters_in dispositions tasks letters_out attachments templates audit_log)

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2; }
die() { log "GALAT: $*"; exit 1; }

dc() {
  docker compose ${COMPOSE_ENV_FILE:+--env-file "$COMPOSE_ENV_FILE"} "$@"
}

require_tools() {
  if [ "$MODE" = docker ]; then
    command -v docker >/dev/null || die "docker tidak ditemukan."
  else
    command -v pg_dump >/dev/null || die "pg_dump tidak ditemukan (pasang postgresql-client)."
    command -v pg_restore >/dev/null || die "pg_restore tidak ditemukan."
    [ -n "${DATABASE_URL:-}" ] || die "DATABASE_URL wajib diisi pada mode host."
    [ -n "${STORAGE_DIR:-}" ] || die "STORAGE_DIR wajib diisi pada mode host."
  fi
  command -v sha256sum >/dev/null || die "sha256sum tidak ditemukan."
  command -v tar >/dev/null || die "tar tidak ditemukan."
}

# Dump format custom ke stdout.
db_dump() {
  if [ "$MODE" = docker ]; then
    # shellcheck disable=SC2016  # $POSTGRES_* sengaja diekspansi di dalam kontainer db
    dc exec -T db sh -c 'pg_dump --format=custom --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB"'
  else
    pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL"
  fi
}

# Membaca dump dari stdin ke database aplikasi (menimpa).
db_restore() {
  if [ "$MODE" = docker ]; then
    # shellcheck disable=SC2016
    dc exec -T db sh -c 'pg_restore --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
  else
    pg_restore --clean --if-exists --no-owner --no-privileges -d "$DATABASE_URL"
  fi
}

# Arsip tar.gz isi folder lampiran ke stdout.
storage_archive() {
  if [ "$MODE" = docker ]; then
    dc exec -T app tar -C /data/private -czf - .
  else
    tar -C "$STORAGE_DIR" -czf - .
  fi
}

# SELECT (SELECT count(*) FROM t1) AS t1, ...
counts_sql() {
  local q="SELECT " first=1 t
  for t in "${TABLES[@]}"; do
    [ $first -eq 1 ] || q+=", "
    q+="(SELECT count(*) FROM $t) AS $t"
    first=0
  done
  printf '%s' "$q"
}
