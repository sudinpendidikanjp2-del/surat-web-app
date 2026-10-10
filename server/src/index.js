import express from 'express';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from './config.js';
import { migrate, pool } from './db.js';
import { loadUser, requireAuth, csrfGuard } from './security.js';
import { HttpError } from './util.js';
import { startJobs } from './jobs.js';
import { ensureBaseData } from './seed.js';
import auth from './routes/auth.js';
import admin from './routes/admin.js';
import lettersIn from './routes/lettersIn.js';
import dispositions from './routes/dispositions.js';
import tasks from './routes/tasks.js';
import lettersOut from './routes/lettersOut.js';
import templates from './routes/templates.js';
import files from './routes/files.js';
import insight from './routes/insight.js';
import pub from './routes/public.js';
import ocr from './routes/ocr.js';
import { stopOcr } from './ocr.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(loadUser);

  // Pemeriksaan kesehatan untuk orkestrator/load balancer. /healthz: proses hidup. /readyz: database terjangkau.
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.get('/readyz', async (_req, res) => {
    try { await pool.query('SELECT 1'); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); }
  });

  const api = express.Router();
  api.use(csrfGuard);
  api.use('/auth', auth);
  api.use('/public', pub);
  api.use(requireAuth);
  api.use('/ocr', ocr);
  api.use('/letters-in', lettersIn);
  api.use('/dispositions', dispositions);
  api.use('/tasks', tasks);
  api.use('/letters-out', lettersOut);
  api.use('/templates', templates);
  api.use('/files', files);
  api.use('/', admin);
  api.use('/', insight);
  api.use((_req, _res, next) => next(new HttpError(404, 'Endpoint tidak ditemukan')));
  app.use('/api', api);

  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `File terlalu besar (maks ${Math.round(config.maxUploadBytes / 1048576)} MB)` : 'Unggahan tidak valid';
      return res.status(400).json({ error: msg });
    }
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Format permintaan tidak valid' });
    if (err?.code === '23505') return res.status(409).json({ error: 'Data duplikat. Nilai tersebut sudah ada' });
    if (err?.code === '23503') return res.status(409).json({ error: 'Data terkait tidak ditemukan atau masih dipakai' });
    console.error(`${req.method} ${req.originalUrl}`, err);
    res.status(500).json({ error: 'Terjadi kesalahan pada server' });
  });
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await migrate();
  await ensureBaseData();
  const app = createApp();
  const server = app.listen(config.port, () => console.log(`Server berjalan di http://localhost:${config.port}`));
  startJobs();
  const stop = () => {
    setTimeout(() => process.exit(1), 15000).unref(); // paksa keluar bila koneksi menggantung
    server.close(() => stopOcr().then(() => pool.end()).then(() => process.exit(0)));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
