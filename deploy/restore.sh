#!/usr/bin/env bash
# Memulihkan database + lampiran dari folder hasil backup.sh.
#
#   deploy/restore.sh --verify backups/surat-20261102-020000   # UJI, tidak mengubah produksi
#   deploy/restore.sh --yes    backups/surat-20261102-020000   # PEMULIHAN NYATA (menimpa data)
#
# --verify memulihkan dump ke database sementara lalu membandingkan jumlah baris tabel inti dengan produksi.
# Pemulihan nyata menghentikan app (mode docker), menimpa database dan lampiran, lalu menyalakannya kembali.
# Untuk arsip dari Admin > Cadangan Data (.tar.gz), pulihkan dari halaman itu, bukan dengan skrip ini.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib.sh
. "$here/lib.sh"

action=""
case "${1:-}" in
  --verify) action=verify; shift ;;
  --yes) action=restore; shift ;;
  *) die "pakai: restore.sh (--verify | --yes) <folder-cadangan>" ;;
esac
src="${1:-}"
[ -d "$src" ] || die "folder cadangan tidak ditemukan: $src"
require_tools

log "Memeriksa checksum…"
(cd "$src" && sha256sum --check --quiet SHA256SUMS) || die "checksum tidak cocok; cadangan rusak atau diubah."

if [ "$action" = verify ]; then
  scratch="verify_$(date +%s)"
  log "Memulihkan ke database sementara $scratch…"
  if [ "$MODE" = docker ]; then
    dc exec -T db sh -c "createdb -U \"\$POSTGRES_USER\" $scratch"
    trap 'dc exec -T db sh -c "dropdb -U \"\$POSTGRES_USER\" --if-exists '"$scratch"'" >/dev/null 2>&1 || true' EXIT
    dc exec -T db sh -c "pg_restore --no-owner --no-privileges -U \"\$POSTGRES_USER\" -d $scratch" < "$src/db.dump"
    restored="$(dc exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d $scratch -At -F ' ' -c \"$(counts_sql)\"" | tr -d '\r')"
    live="$(dc exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -At -F ' ' -c \"$(counts_sql)\"" | tr -d '\r')"
  else
    base="${DATABASE_URL%\?*}"
    admin="${base%/*}/postgres"
    psql "$admin" -qc "CREATE DATABASE $scratch" >/dev/null
    trap 'psql "'"$admin"'" -qc "DROP DATABASE IF EXISTS '"$scratch"'" >/dev/null 2>&1 || true' EXIT
    pg_restore --no-owner --no-privileges -d "${base%/*}/$scratch" "$src/db.dump"
    restored="$(psql "${base%/*}/$scratch" -At -F ' ' -c "$(counts_sql)")"
    live="$(psql "$base" -At -F ' ' -c "$(counts_sql)")"
  fi
  log "Jumlah baris (${TABLES[*]}):"
  log "  hasil pulih : $restored"
  log "  produksi    : $live"
  tar -tzf "$src/storage.tar.gz" >/dev/null || die "arsip lampiran tidak dapat dibaca."
  log "Verifikasi selesai: dump dapat dipulihkan penuh dan arsip lampiran terbaca."
  log "(Angka produksi boleh lebih besar bila ada data baru sejak cadangan dibuat.)"
  exit 0
fi

log "PEMULIHAN NYATA dari $src: data saat ini akan ditimpa."
if [ "$MODE" = docker ]; then
  log "Menghentikan app…"
  dc stop app >/dev/null
fi
log "Memulihkan database…"
db_restore < "$src/db.dump"
log "Memulihkan lampiran…"
if [ "$MODE" = docker ]; then
  dc run --rm --no-deps -T --entrypoint sh app -c 'find /data/private -mindepth 1 -delete && tar -C /data/private -xzf -' < "$src/storage.tar.gz"
  log "Menyalakan kembali…"
  dc up -d --no-build app >/dev/null
else
  find "$STORAGE_DIR" -mindepth 1 -delete
  tar -C "$STORAGE_DIR" -xzf "$src/storage.tar.gz"
fi
log "Pemulihan selesai. Semua pengguna perlu masuk lagi. Periksa /readyz lalu masuk ke aplikasi."
