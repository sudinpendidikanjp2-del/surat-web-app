import { Router } from 'express';
import { one, all } from '../db.js';
import { wrap, int, notFound, forbidden } from '../util.js';
import { loadLetterIn } from '../cases.js';
import { visibleLettersOut } from '../perm.js';
import { absPath } from '../storage.js';
import { audit } from '../record.js';

const r = Router();
const INLINE = new Set(['application/pdf', 'image/png', 'image/jpeg']);

/** Semua file diambil lewat sini; tidak ada folder publik. Hak akses mengikuti surat induknya. */
r.get('/:id', wrap(async (req, res) => {
  const a = await one('SELECT * FROM attachments WHERE id=$1', [int(req.params.id, 'ID')]);
  if (!a) throw notFound('File tidak ditemukan');
  if (a.letter_in_id) {
    if (req.user.role === 'viewer') throw forbidden('Viewer tidak dapat membuka dokumen');
    await loadLetterIn({ one, all }, req.user, a.letter_in_id);
  } else {
    const vis = visibleLettersOut(req.user, 'lo', 1);
    if (!(await one(`SELECT 1 FROM letters_out lo WHERE lo.id=$1 AND ${vis.sql}`, [a.letter_out_id, ...vis.params]))) throw forbidden('Anda tidak memiliki akses ke dokumen ini');
  }
  const inline = INLINE.has(a.mime) && req.query.unduh !== '1';
  res.setHeader('Content-Type', a.mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.nama)}`);
  await audit(null, req, 'FILE_DIBUKA', 'attachment', a.id, { nama: a.nama });
  res.sendFile(absPath(a.path));
}));

export default r;
