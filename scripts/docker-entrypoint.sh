#!/bin/sh
# Entrypoint image SiSurat. Dimulai sebagai root hanya untuk menyiapkan folder data, lalu turun ke pengguna node.
#
#   sisurat serve                          jalankan server (bawaan)
#   sisurat reset-password <username>      atur kata sandi baru (diminta lewat terminal, atau dari PASSWORD=...)
#   sisurat <perintah lain>                dijalankan apa adanya, misalnya: sisurat sh
set -eu

STORAGE_DIR="${STORAGE_DIR:-/data/private}"
BACKUP_DIR="${BACKUP_DIR:-/data/backups}"

# Jalankan perintah sebagai node. Bila container sudah berjalan sebagai pengguna lain (user: di compose), pakai apa adanya.
as_node() {
  if [ "$(id -u)" = "0" ]; then
    exec setpriv --reuid=node --regid=node --init-groups -- "$@"
  fi
  exec "$@"
}

# Folder host yang dipasang ke /data biasanya milik root: perbaiki pemiliknya. Hanya file yang belum milik node
# yang diubah, jadi cepat walau lampiran sudah banyak.
prepare_dirs() {
  [ "$(id -u)" = "0" ] || return 0
  for d in "$STORAGE_DIR" "$BACKUP_DIR"; do
    mkdir -p "$d"
    find "$d" ! -user node -exec chown node:node {} +
  done
  # Pemulihan cadangan menukar folder lampiran dengan folder di sampingnya, jadi folder induknya harus dapat ditulis node.
  chown node:node "$(dirname "$STORAGE_DIR")"
}

cmd="${1:-serve}"
[ "$#" -gt 0 ] && shift
case "$cmd" in
  serve)
    prepare_dirs
    as_node node /app/server.js "$@"
    ;;
  reset-password)
    as_node node /app/ops/reset-password.mjs "$@"
    ;;
  *)
    exec "$cmd" "$@"
    ;;
esac
