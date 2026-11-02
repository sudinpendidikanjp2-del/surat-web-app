# syntax=docker/dockerfile:1
# Image produksi SiSurat: aplikasi dan perintah operasional dalam satu image.
# Migrasi skema dan data dasar berjalan otomatis saat server mulai (instrumentation.ts), jadi tidak perlu langkah terpisah.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 BUILD_STANDALONE=1
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
# HOSTNAME=0.0.0.0 wajib: tanpa ini Docker mengisi HOSTNAME dengan ID container dan server hanya mendengar di satu
# alamat jaringan container, sehingga healthcheck (127.0.0.1) dan reverse proxy di jaringan lain gagal tersambung.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    STORAGE_DIR=/data/private BACKUP_DIR=/data/backups
# LibreOffice hanya untuk unduh PDF surat keluar. Hapus baris ini bila tidak dibutuhkan (image jauh lebih kecil).
RUN apt-get update \
 && apt-get install -y --no-install-recommends libreoffice-writer-nogui fonts-liberation fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data/private /data/backups && chown -R node:node /data
# Build mandiri Next.js: server.js beserta node_modules yang benar-benar dipakai. --chown di COPY, bukan chown -R
# sesudahnya, agar isi /app tidak tersalin dua kali ke layer image.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --chown=node:node scripts/ops ./ops
COPY --chmod=755 scripts/docker-entrypoint.sh /usr/local/bin/sisurat
# Tanpa USER node: entrypoint mulai sebagai root untuk memperbaiki pemilik /data (misalnya folder host yang dipasang),
# lalu menjalankan aplikasi sebagai node.
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/readyz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
ENTRYPOINT ["sisurat"]
CMD ["serve"]
