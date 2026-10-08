import { saveBuffer, validateFile, mimeFor } from './storage.js';

export const KATEGORI_IN = ['SURAT', 'PENDUKUNG', 'HASIL', 'DRAF', 'FINAL', 'BUKTI', 'TTD', 'DISPOSISI'];

/**
 * Simpan file ke storage privat dan catat metadata. File dengan nama dan kategori sama pada
 * surat yang sama menjadi versi berikutnya; versi lama tetap tersimpan.
 */
export async function saveAttachment(db, { file, kategori, letterInId = null, letterOutId = null, taskId = null, userId, nama = null, buffer = null, ext = null, mime = null }) {
  const body = buffer || file.buffer;
  const e = ext || validateFile(file);
  const displayName = (nama || file.originalname).slice(0, 200);
  const rel = await saveBuffer(body, e);
  const groupKey = `${kategori}:${displayName.toLowerCase()}`;
  const prev = await db.one(
    `SELECT COALESCE(max(versi),0) AS v FROM attachments WHERE group_key=$1 AND letter_in_id IS NOT DISTINCT FROM $2 AND letter_out_id IS NOT DISTINCT FROM $3`,
    [groupKey, letterInId, letterOutId],
  );
  const row = await db.one(
    `INSERT INTO attachments(letter_in_id,letter_out_id,task_id,kategori,nama,mime,ukuran,path,versi,group_key,uploader_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,nama,kategori,versi,ukuran,mime,created_at`,
    [letterInId, letterOutId, taskId, kategori, displayName, mime || mimeFor(e), body.length, rel, prev.v + 1, groupKey, userId],
  );
  return row;
}

export const ATT_SELECT = `SELECT a.id,a.nama,a.kategori,a.mime,a.ukuran,a.versi,a.task_id,a.created_at,a.letter_in_id,a.letter_out_id,u.nama AS uploader
  FROM attachments a LEFT JOIN users u ON u.id=a.uploader_id`;
