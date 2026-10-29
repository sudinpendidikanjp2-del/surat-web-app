/**
 * Isi surat kaya disimpan sebagai HTML dari editor (paragraf, daftar, tabel, tebal/miring/garis bawah).
 * Nilai lama berupa teks biasa tetap sah: dianggap paragraf per baris.
 */
export const RICH_MAX = 60000;

export const isRichHtml = (v: string) => /^\s*<(p|h[1-6]|ul|ol|table|blockquote|div|hr)[\s>/]/i.test(v);

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/** Teks polos dari HTML editor, untuk pemeriksaan wajib isi dan pencarian. Sel tabel dipisah tab, baris dipisah baris baru. */
export function richToPlain(v: string) {
  if (!isRichHtml(v)) return v;
  return decode(
    v
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*(?=<\/t[dh]>)/gi, '')
      .replace(/<\/(td|th)>/gi, '\t')
      .replace(/<\/(p|h[1-6]|li|tr|blockquote|div)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const richIsEmpty = (v: string | null | undefined) => !richToPlain(String(v ?? '')).trim();
