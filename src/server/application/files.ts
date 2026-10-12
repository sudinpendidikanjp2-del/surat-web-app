import { forbidden, invalid, notFound } from '@/domain/errors';
import { is } from '@/domain/roles';
import { normalizeTrackCode, publicSteps, TRACK_EXPIRY_DAYS } from '@/domain/tracking';
import { auditFor, type AnonCtx, type Ctx, type Deps } from './context';
import type { IncomingFile } from './ports';
import { loadLetterIn, loadLetterOut } from './shared';

/** Semua file diambil lewat sini; tidak ada folder publik. Hak akses mengikuti surat induknya. */
export async function openAttachment(d: Deps, ctx: Ctx, id: number) {
  const r = d.uow.read;
  const a = await r.attachments.find(id);
  if (!a) throw notFound('File tidak ditemukan');
  if (a.letter_in_id) {
    if (is(ctx.actor, 'viewer')) throw forbidden('Pemantau tidak dapat membuka dokumen');
    await loadLetterIn(r, ctx.actor, a.letter_in_id);
  } else if (a.letter_out_id) {
    await loadLetterOut(r, ctx.actor, a.letter_out_id);
  }
  await d.uow.run((w) => auditFor(w, ctx, 'FILE_DIBUKA', 'attachment', a.id, { nama: a.nama }));
  return { body: await d.files.read(a.path), mime: a.mime, nama: a.nama };
}

const isImage = (b: Buffer) =>
  (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
  (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) ||
  (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP');

/** Baca foto surat. Hasilnya hanya usulan: pengguna tetap memeriksa dan menyimpan sendiri. */
export async function readLetterPhoto(d: Deps, ctx: Ctx, file: IncomingFile | null) {
  if (!is(ctx.actor, 'superadmin', 'tu')) throw forbidden();
  d.limiter.hit(`ocr:${ctx.actor.id}`, 10 * 60 * 1000, 20);
  if (!file) throw invalid('Pilih foto surat');
  if (file.buffer.length > 12 * 1024 * 1024) throw invalid('Foto terlalu besar (maks 12 MB)');
  if (!isImage(file.buffer)) throw invalid('Format foto tidak didukung. Gunakan JPG, PNG, atau WebP (foto HEIC dari iPhone: ubah ke JPG, atau atur kamera ke "Paling Kompatibel")');
  let out;
  try {
    out = await d.ocr.recognize(file.buffer);
  } catch (e) {
    console.error('OCR gagal', e);
    throw invalid('Foto tidak dapat dibaca. Coba foto ulang dengan pencahayaan merata');
  }
  await d.uow.run((r) => auditFor(r, ctx, 'OCR_SURAT', 'ocr', null, { ukuran: file.buffer.length, keyakinan: out.quality.meanConf, terbaca: Object.keys(out.fields) }));
  return { fields: out.fields, missing: out.missing, quality: out.quality, text: out.text };
}

const NOT_FOUND = 'Kode tidak ditemukan atau sudah tidak berlaku';

/**
 * Pelacakan publik tanpa login. Aman karena kode acak 100 bit, pembatas laju per alamat, jawaban
 * yang sama untuk kode salah, dimatikan, atau kedaluwarsa, dan isi terbatas pada tahapan umum.
 */
export async function track(d: Deps, ctx: AnonCtx, raw: string) {
  d.limiter.hit(`lacak:${ctx.ip}`, 10 * 60 * 1000, 30);
  const code = normalizeTrackCode(raw);
  if (!code) throw notFound(NOT_FOUND);
  const l = await d.uow.read.lettersIn.trackingFacts(code);
  if (!l || !l.track_enabled) throw notFound(NOT_FOUND);
  if (l.selesai_at && Date.now() - new Date(l.selesai_at).getTime() > TRACK_EXPIRY_DAYS * 86_400_000) throw notFound(NOT_FOUND);
  return publicSteps(l);
}
