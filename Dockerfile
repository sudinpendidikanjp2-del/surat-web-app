# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 BUILD_STANDALONE=1
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 STORAGE_DIR=/data/private BACKUP_DIR=/data/backups
# LibreOffice hanya untuk unduh PDF surat keluar. Hapus baris ini bila tidak dibutuhkan (image jauh lebih kecil).
RUN apt-get update \
 && apt-get install -y --no-install-recommends libreoffice-writer-nogui fonts-liberation fonts-dejavu-core curl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Build mandiri Next.js: server.js beserta node_modules yang benar-benar dipakai.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
RUN mkdir -p /data/private /data/backups && chown -R node:node /data /app
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD curl -fsS http://localhost:3000/readyz || exit 1
CMD ["node", "server.js"]
