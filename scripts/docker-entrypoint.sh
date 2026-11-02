#!/bin/sh
# Entrypoint image SiSurat. Image berjalan sebagai pengguna node (USER node). Bila operator sengaja menjalankannya
# sebagai root (mis. `user: "0"` untuk folder host milik root), entrypoint memperbaiki pemilik folder data lalu
# turun ke node, sehingga aplikasi tidak pernah berjalan sebagai root.
#
#   sisurat serve                          jalankan server (bawaan)
#   sisurat reset-password <username>      atur kata sandi baru (diminta lewat terminal, atau dari PASSWORD=...)
#   sisurat check                          periksa modul dan berkas data yang dimuat saat berjalan (OCR, PDF)
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
  # Compose memakai cap_drop: ALL; mode root butuh kemampuan itu dikembalikan secara tegas.
  if ! { for d in "$STORAGE_DIR" "$BACKUP_DIR"; do
           mkdir -p "$d" && find "$d" ! -user node -exec chown node:node {} + || exit 1
         done
         # Pemulihan cadangan menukar folder lampiran dengan folder di sampingnya, jadi induknya harus dapat ditulis node.
         chown node:node "$(dirname "$STORAGE_DIR")"; } 2>/dev/null; then
    echo "sisurat: gagal mengubah pemilik folder data sebagai root." >&2
    echo "  Tambahkan pada layanan app: cap_add: [CHOWN, FOWNER, DAC_OVERRIDE, SETUID, SETGID]" >&2
    echo "  atau jalankan sekali di host: chown -R 1000:1000 <folder-data> dan hapus user: \"0\"." >&2
    exit 1
  fi
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
  check)
    cd /app && as_node node /app/ops/check-runtime.mjs "$@"
    ;;
  *)
    exec "$cmd" "$@"
    ;;
esac
