/** Kode pelacakan untuk pengirim surat. Murni; sumber acak dari Web Crypto (ada di Node dan peramban). */

// Alfabet Crockford base32: tanpa I, L, O, U agar mudah dibaca dan diketik.
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 20 karakter = 100 bit acak. Tidak dapat ditebak dan tidak memuat isi surat. */
export function newTrackCode(): string {
  const bytes = new Uint8Array(20);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < 20; i++) out += ALPHA[bytes[i] % 32];
  return out;
}

export const formatTrackCode = (c: string | null | undefined) => (c || '').match(/.{1,4}/g)?.join('-') || '';

/** Terima kode berformat, tanpa tanda hubung, atau tautan penuh. Hasil: 20 karakter atau null. */
export function normalizeTrackCode(input: unknown): string | null {
  let s = String(input || '').trim();
  const m = s.match(/\/lacak\/([^/?#\s]+)/i);
  if (m) s = m[1];
  s = s.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return /^[0-9A-HJKMNP-TV-Z]{20}$/.test(s) ? s : null;
}

export const TRACK_EXPIRY_DAYS = 30;

export interface TrackingFacts {
  no_surat: string;
  tgl_diterima: string;
  created_at: string;
  diteruskan_at: string | null;
  disp_at: string | null;
  proc_at: string | null;
  conf_at: string | null;
  sent_at: string | null;
  selesai_at: string | null;
}

/** Tahapan umum yang boleh dilihat publik: tanpa perihal, nama pegawai, atau catatan internal. */
export function publicSteps(l: TrackingFacts) {
  const day = (t: string | null) => (t ? new Date(t).toISOString().slice(0, 10) : null);
  const jawab = [l.sent_at, l.conf_at].filter((x): x is string => Boolean(x)).sort()[0] || null;
  const steps = [
    { key: 'diterima', label: 'Surat diterima', tanggal: day(l.created_at) },
    { key: 'diteruskan', label: 'Diteruskan kepada pimpinan', tanggal: day(l.diteruskan_at || l.disp_at) },
    { key: 'disposisi', label: 'Pimpinan sudah memberi arahan', tanggal: day(l.disp_at) },
    { key: 'diproses', label: 'Sedang dikerjakan', tanggal: day(l.proc_at) },
    { key: 'jawaban', label: 'Jawaban sudah disampaikan', tanggal: day(jawab) },
    { key: 'selesai', label: 'Selesai', tanggal: day(l.selesai_at) },
  ].map((s) => ({ ...s, done: Boolean(s.tanggal) }));
  const last = [...steps].reverse().find((s) => s.done)!;
  const stamps = [l.created_at, l.diteruskan_at, l.disp_at, l.proc_at, jawab, l.selesai_at].filter((x): x is string => Boolean(x)).map((t) => new Date(t).getTime());
  return {
    no_surat: l.no_surat,
    tgl_diterima: day(l.tgl_diterima),
    posisi: last.label,
    selesai: Boolean(l.selesai_at),
    steps,
    diperbarui: day(new Date(Math.max(...stamps)).toISOString()),
  };
}
export type PublicTracking = ReturnType<typeof publicSteps>;
