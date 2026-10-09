import { Router } from 'express';
import multer from 'multer';
import { wrap, bad } from '../util.js';
import { limiter } from '../security.js';
import { requireRole } from '../perm.js';
import { audit } from '../record.js';
import { recognize } from '../ocr.js';

const r = Router();
const up = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 1 } });
const limit = limiter({ windowMs: 10 * 60 * 1000, max: 20, key: (req) => `ocr:${req.user?.id}` });

const isImage = (b) =>
  (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
  (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) ||
  (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP');

/** Baca foto surat masuk. Hasil hanya usulan: pengguna wajib memeriksa dan menyimpan sendiri. */
r.post('/surat-masuk', requireRole('superadmin', 'tu'), limit, up.single('foto'), wrap(async (req, res) => {
  if (!req.file) throw bad('Pilih foto surat');
  if (!isImage(req.file.buffer)) throw bad('Format foto tidak didukung. Gunakan JPG, PNG, atau WebP (foto HEIC dari iPhone: ubah ke JPG, atau atur kamera ke "Paling Kompatibel")');
  let out;
  try {
    out = await recognize(req.file.buffer);
  } catch (e) {
    console.error('OCR gagal', e);
    throw bad('Foto tidak dapat dibaca. Coba foto ulang dengan pencahayaan merata');
  }
  await audit(null, req, 'OCR_SURAT', 'ocr', null, { ukuran: req.file.size, keyakinan: out.quality.meanConf, terbaca: Object.keys(out.fields) });
  res.json({ fields: out.fields, missing: out.missing, quality: out.quality, text: out.text });
}));

export default r;
