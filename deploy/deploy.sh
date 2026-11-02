#!/usr/bin/env bash
# Pembaruan produksi: cadangan → tarik kode/image → naikkan layanan → tunggu sehat.
#   deploy/deploy.sh            # dari folder proyek di server (.env sudah diisi)
# Dengan image dari ghcr.io (COMPOSE_FILE memuat docker-compose.image.yml) image ditarik; selain itu dibangun di server.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib.sh
. "$here/lib.sh"
cd "$here/.."

[ -f .env ] || die ".env belum ada (salin dari deploy/env.production.example)."
require_tools
if dc config --profiles 2>/dev/null | grep -qx nginx && grep -Eq '^COMPOSE_PROFILES=.*nginx' .env; then
  grep -Eq '^DOMAIN=.+' .env || die "profil nginx aktif tetapi DOMAIN belum diisi di .env."
fi

if dc ps --status running --services 2>/dev/null | grep -qx db; then
  log "Cadangan sebelum deploy…"
  "$here/backup.sh"
fi

if [ -d .git ]; then
  log "Menarik kode terbaru…"
  git pull --ff-only
fi

log "Menarik image yang tidak dibangun di server…"
dc pull --ignore-buildable --quiet

log "Naikkan layanan (migrasi berjalan otomatis saat app menyala)…"
dc up -d --build --remove-orphans

log "Menunggu app sehat…"
state=""
for _ in $(seq 1 60); do
  state="$(dc ps --format '{{.Service}} {{.Health}}' | awk '$1=="app"{print $2}')"
  [ "$state" = healthy ] && break
  sleep 3
done
[ "$state" = healthy ] || { dc logs --tail=80 app >&2; die "app tidak sehat; periksa log di atas (rollback: docs/deployment.md bagian Pembaruan dan rollback)."; }

dc ps
log "Deploy selesai."
