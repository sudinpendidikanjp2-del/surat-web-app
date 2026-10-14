import 'server-only';
import type { Deps } from './application/context';
import { config } from './config';
import { getPool } from './infrastructure/db/client';
import { pgUnitOfWork } from './infrastructure/db/unit-of-work';
import { docxRenderer } from './infrastructure/documents/docx';
import { ocrEngine } from './infrastructure/ocr/engine';
import { qrCodeEncoder } from './infrastructure/qr/qrcode';
import { memoryLimiter, randomTokens, scryptPasswords } from './infrastructure/security/crypto';
import { localFileStorage } from './infrastructure/storage/local-files';

/**
 * Composition root: satu-satunya tempat implementasi infrastruktur dipasangkan ke port aplikasi.
 * Disimpan di globalThis agar satu proses hanya punya satu set (pembatas laju, pool, pekerja OCR).
 */
const g = globalThis as unknown as { __suratDeps?: Deps };

export function deps(): Deps {
  if (!g.__suratDeps) {
    g.__suratDeps = {
      uow: pgUnitOfWork(getPool(config.databaseUrl)),
      files: localFileStorage(config.storageDir, config.maxUploadBytes),
      documents: docxRenderer,
      ocr: ocrEngine,
      qr: qrCodeEncoder,
      passwords: scryptPasswords,
      tokens: randomTokens,
      limiter: memoryLimiter(),
      sessionHours: config.sessionHours,
    };
  }
  return g.__suratDeps;
}
