import { Router } from 'express';
import { one } from '../db.js';
import { wrap, HttpError } from '../util.js';
import { limiter } from '../security.js';
import { normalizeTrackCode } from '../tracking.js';

const r = Router();
const limit = limiter({ windowMs: 10 * 60 * 1000, max: 30, key: (req) => req.ip });
const NOT_FOUND = 'Kode tidak ditemukan atau sudah tidak berlaku';
const EXPIRY_DAYS = 30;

/**
 * Pelacakan publik tanpa login. Aman karena: kode acak 100 bit (tidak dapat ditebak), pembatas laju per alamat IP,
 * jawaban sama untuk kode salah, dinonaktifkan, atau kedaluwarsa, dan isi terbatas pada tahapan umum
 * (tanpa perihal, nama pegawai, instruksi, atau catatan internal).
 */
r.get('/lacak/:code', limit, wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const code = normalizeTrackCode(req.params.code);
  if (!code) throw new HttpError(404, NOT_FOUND);
  const l = await one(
    `SELECT li.no_surat, li.tgl_diterima, li.created_at, li.diteruskan_at, li.selesai_at, li.status, li.track_enabled,
            (SELECT min(created_at) FROM dispositions WHERE letter_in_id=li.id AND status<>'DIKEMBALIKAN') AS disp_at,
            (SELECT min(accepted_at) FROM dispositions WHERE letter_in_id=li.id) AS proc_at,
            (SELECT min(created_at) FROM confirmations WHERE letter_in_id=li.id) AS conf_at,
            (SELECT min(sent_at) FROM letters_out WHERE letter_in_id=li.id AND sent_at IS NOT NULL) AS sent_at
       FROM letters_in li WHERE li.track_code=$1`, [code],
  );
  if (!l || !l.track_enabled) throw new HttpError(404, NOT_FOUND);
  if (l.selesai_at && Date.now() - new Date(l.selesai_at).getTime() > EXPIRY_DAYS * 86400000) throw new HttpError(404, NOT_FOUND);
  const day = (t) => (t ? new Date(t).toISOString().slice(0, 10) : null);
  const jawab = [l.sent_at, l.conf_at].filter(Boolean).sort()[0] || null;
  const steps = [
    { key: 'diterima', label: 'Surat diterima', tanggal: day(l.created_at) },
    { key: 'diteruskan', label: 'Diteruskan kepada pimpinan', tanggal: day(l.diteruskan_at || l.disp_at) },
    { key: 'disposisi', label: 'Disposisi diberikan', tanggal: day(l.disp_at) },
    { key: 'diproses', label: 'Sedang ditindaklanjuti', tanggal: day(l.proc_at) },
    { key: 'jawaban', label: 'Jawaban disampaikan', tanggal: day(jawab) },
    { key: 'selesai', label: 'Selesai', tanggal: day(l.selesai_at) },
  ].map((s) => ({ ...s, done: Boolean(s.tanggal) }));
  const last = [...steps].reverse().find((s) => s.done);
  const stamps = [l.created_at, l.diteruskan_at, l.disp_at, l.proc_at, jawab, l.selesai_at].filter(Boolean).map((t) => new Date(t).getTime());
  res.json({
    no_surat: l.no_surat, tgl_diterima: day(l.tgl_diterima), posisi: last.label, selesai: Boolean(l.selesai_at), steps,
    diperbarui: day(new Date(Math.max(...stamps))),
  });
}));

export default r;
