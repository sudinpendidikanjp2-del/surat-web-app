import { forbidden, notFound } from '@/domain/errors';
import type { KategoriDokumen } from '@/domain/letter-in';
import { deriveStatus } from '@/domain/letter-in';
import type { Actor } from '@/domain/roles';
import type { Deps } from './context';
import type { IncomingFile, Repos } from './ports';

/** Muat surat masuk dengan pemeriksaan hak lihat: 403 bila ada tapi bukan haknya, 404 bila tidak ada. */
export async function loadLetterIn(r: Repos, actor: Actor, id: number) {
  const li = await r.lettersIn.findVisible(actor, id);
  if (li) return li;
  throw (await r.lettersIn.exists(id)) ? forbidden('Anda tidak memiliki akses ke surat ini') : notFound('Surat tidak ditemukan');
}

export async function loadLetterOut(r: Repos, actor: Actor, id: number) {
  const lo = await r.lettersOut.findVisible(actor, id);
  if (lo) return lo;
  throw (await r.lettersOut.exists(id)) ? forbidden('Anda tidak memiliki akses ke surat ini') : notFound('Surat keluar tidak ditemukan');
}

/** Hitung ulang status surat dari keadaan disposisi, tugas, dan surat balasannya. */
export async function recomputeStatus(r: Repos, letterId: number) {
  const current = await r.lettersIn.lockStatus(letterId);
  if (!current) return null;
  const next = deriveStatus(current, await r.lettersIn.statusFacts(letterId));
  await r.lettersIn.setStatus(letterId, next);
  return next;
}

/**
 * Simpan file ke penyimpanan privat dan catat metadatanya. File dengan nama dan kategori sama pada
 * surat yang sama menjadi versi berikutnya; versi lama tetap ada.
 */
export async function saveAttachment(d: Deps, r: Repos, p: {
  file?: IncomingFile; buffer?: Buffer; ext?: string; mime?: string; nama?: string;
  kategori: KategoriDokumen; letterInId?: number | null; letterOutId?: number | null; taskId?: number | null; userId: number;
}) {
  const body = p.buffer ?? p.file!.buffer;
  const ext = p.ext ?? d.files.validate(p.file!);
  const nama = (p.nama || p.file!.name).slice(0, 200);
  const path = await d.files.save(body, ext);
  const groupKey = `${p.kategori}:${nama.toLowerCase()}`;
  const versi = (await r.attachments.lastVersion(groupKey, p.letterInId ?? null, p.letterOutId ?? null)) + 1;
  return r.attachments.insert({
    letterInId: p.letterInId ?? null, letterOutId: p.letterOutId ?? null, taskId: p.taskId ?? null, kategori: p.kategori,
    nama, mime: p.mime || d.files.mimeFor(ext), ukuran: body.length, path, versi, groupKey, uploaderId: p.userId,
  });
}

/** Nama pengguna yang disebut dengan @nama dalam teks. */
export const mentionedUsernames = (teks: string) => [...teks.matchAll(/@([a-z0-9._-]+)/gi)].map((m) => m[1].toLowerCase());
