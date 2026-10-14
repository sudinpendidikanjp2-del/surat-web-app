import type { Actor } from '@/domain/roles';
import { invalid, isAppError } from '@/domain/errors';
import type { Repos } from './ports';
import type { DocumentRenderer, FileStorage, OcrEngine, PasswordHasher, QrEncoder, RateLimiter, SessionTokens, UnitOfWork } from './ports';

/**
 * Semua ketergantungan use case, disuntikkan dari composition root (src/server/container.ts).
 * Use case tidak pernah mengimpor modul infrastruktur secara langsung.
 */
export interface Deps {
  uow: UnitOfWork;
  files: FileStorage;
  documents: DocumentRenderer;
  ocr: OcrEngine;
  qr: QrEncoder;
  passwords: PasswordHasher;
  tokens: SessionTokens;
  limiter: RateLimiter;
  sessionHours: number;
}

/** Siapa yang bertindak, dari mana, dan alamat dasar aplikasi (untuk tautan QR dan pelacakan). */
export interface Ctx {
  actor: Actor;
  ip: string;
  baseUrl: string;
}

/** Ctx tanpa pengguna, untuk login dan pelacakan publik. */
export interface AnonCtx { ip: string; baseUrl: string }

/** Catat audit dengan identitas pelaku dari ctx. */
export const auditFor = (r: Repos, ctx: Ctx | (AnonCtx & { actor?: Actor | null }), aksi: string, entitas: string, entitasId: number | string | null, detail: Record<string, unknown> = {}) =>
  r.journal.audit({ userId: ('actor' in ctx && ctx.actor?.id) || null, ip: ctx.ip, aksi, entitas, entitasId, detail });

/** Jalankan aksi untuk banyak data, satu per satu. Satu kegagalan tidak membatalkan yang lain. */
export async function runBulk(ids: unknown, fn: (id: number) => Promise<unknown>) {
  if (!Array.isArray(ids) || ids.length === 0) throw invalid('Pilih minimal satu data');
  if (ids.length > 200) throw invalid('Maksimal 200 data per aksi massal');
  const list = [...new Set(ids.map(Number).filter(Number.isInteger))];
  const results: { id: number; ok: boolean; error?: string }[] = [];
  for (const id of list) {
    try {
      await fn(id);
      results.push({ id, ok: true });
    } catch (e) {
      if (!isAppError(e)) console.error('aksi massal', id, e);
      results.push({ id, ok: false, error: isAppError(e) ? e.message : 'Terjadi kesalahan pada server' });
    }
  }
  return { results, ok: results.filter((r) => r.ok).length, gagal: results.filter((r) => !r.ok).length };
}

/** Impor baris demi baris: baris yang gagal dilaporkan dengan nomor barisnya (baris 1 adalah judul kolom). */
export async function runRows(rows: Record<string, string>[], fn: (row: Record<string, string>) => Promise<unknown>) {
  if (rows.length === 0) throw invalid('File tidak berisi data. Isi mulai baris kedua, di bawah judul kolom');
  const results: { baris: number; ok: boolean; error?: string }[] = [];
  for (const [i, row] of rows.entries()) {
    try {
      await fn(row);
      results.push({ baris: i + 2, ok: true });
    } catch (e) {
      if (!isAppError(e)) console.error('impor', i + 2, e);
      results.push({ baris: i + 2, ok: false, error: isAppError(e) ? e.message : 'Terjadi kesalahan pada server' });
    }
  }
  return { results, ok: results.filter((r) => r.ok).length, gagal: results.filter((r) => !r.ok).length };
}
