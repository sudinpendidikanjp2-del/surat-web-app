import { invalid } from '@/domain/errors';

/** Lebar sasaran citra halaman. Sama dengan lebar kerja prapengolahan Tesseract agar tidak perlu diubah ukurannya lagi. */
const TARGET_W = 2200;
/** Batas jumlah piksel agar halaman yang sangat panjang tidak menghabiskan memori. */
const MAX_PIXELS = 2200 * 4000;

export const isPdf = (b: Buffer) => b.length > 4 && b.subarray(0, 5).toString('latin1') === '%PDF-';

/**
 * Ubah halaman pertama PDF menjadi PNG (RGB, latar putih) dengan MuPDF. Hanya halaman pertama yang dibaca,
 * karena nomor, tanggal, dan perihal surat ada di sana. PDF terkunci atau tanpa halaman ditolak dengan pesan jelas.
 */
export async function renderFirstPage(buffer: Buffer): Promise<Buffer> {
  // Impor dinamis: modul WASM baru dimuat saat PDF pertama datang.
  const mupdf = await import('mupdf');
  let doc;
  try {
    doc = mupdf.Document.openDocument(buffer, 'application/pdf');
  } catch {
    throw invalid('File PDF rusak atau tidak dapat dibuka');
  }
  try {
    if (doc.needsPassword()) throw invalid('PDF dikunci dengan kata sandi. Buka kuncinya dahulu atau unggah foto suratnya');
    let pages = 0;
    try { pages = doc.countPages(); } catch { pages = 0; }
    if (pages < 1) throw invalid('PDF kosong, tidak ada halaman yang dapat dibaca');
    const page = doc.loadPage(0);
    try {
      const [x0, y0, x1, y1] = page.getBounds();
      const w = Math.max(1, x1 - x0); const h = Math.max(1, y1 - y0);
      let s = TARGET_W / w;
      if (w * h * s * s > MAX_PIXELS) s = Math.sqrt(MAX_PIXELS / (w * h));
      const pix = page.toPixmap(mupdf.Matrix.scale(s, s), mupdf.ColorSpace.DeviceRGB, false, true);
      try {
        return Buffer.from(pix.asPNG());
      } finally {
        pix.destroy();
      }
    } finally {
      page.destroy();
    }
  } finally {
    doc.destroy();
  }
}
