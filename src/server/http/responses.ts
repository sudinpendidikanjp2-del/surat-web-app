import 'server-only';

const cell = (v: unknown) => {
  let s = v == null ? '' : String(v);
  // Cegah injeksi rumus saat CSV dibuka di spreadsheet.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV dengan BOM agar Excel membaca UTF-8 dengan benar. */
export function csv(filename: string, columns: string[], rows: unknown[][]) {
  const body = `﻿${[columns, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` },
  });
}

/** File unduhan atau tampil. Tidak di-cache, tidak boleh diendus jenisnya, dan dibuka dalam sandbox. */
export function file(body: Buffer, { mime, filename, inline = false }: { mime: string; filename: string; inline?: boolean }) {
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': mime,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}

export const today = () => new Date().toISOString().slice(0, 10);
