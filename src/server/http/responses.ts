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

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Ekspor tabel dalam format yang diminta: csv (bawaan), xlsx, atau pdf. */
export async function exportTable(format: string | undefined, name: string, title: string, columns: string[], rows: unknown[][]) {
  const stamp = today();
  if (format === 'xlsx') {
    const { toXlsx } = await import('@/server/infrastructure/spreadsheet/tables');
    return file(await toXlsx(title, columns, rows as never), { mime: XLSX, filename: `${name}-${stamp}.xlsx` });
  }
  if (format === 'pdf') {
    const { toPdf } = await import('@/server/infrastructure/spreadsheet/tables');
    const when = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta' });
    return file(await toPdf(title, `Dicetak ${when}. ${rows.length} baris.`, columns, rows as never), { mime: 'application/pdf', filename: `${name}-${stamp}.pdf` });
  }
  return csv(`${name}-${stamp}.csv`, columns, rows);
}

export const isExport = (format: string | undefined) => format === 'csv' || format === 'xlsx' || format === 'pdf';
