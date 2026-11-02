import 'server-only';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { invalid } from '@/domain/errors';

export type Cell = string | number | boolean | Date | null | undefined;

/** Hindari injeksi rumus saat file dibuka di spreadsheet (nilai teks yang diawali =, +, -, @). */
const safe = (v: Cell) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

/** Excel (.xlsx): baris judul tebal dan dibekukan, saringan otomatis, lebar kolom menyesuaikan isi. */
export async function toXlsx(sheetName: string, columns: string[], rows: Cell[][]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistem Surat';
  const ws = wb.addWorksheet(sheetName.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
  ws.addRow(columns);
  for (const r of rows) ws.addRow(r.map(safe));
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECEDF7' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  columns.forEach((c, i) => {
    const longest = Math.max(c.length, ...rows.slice(0, 500).map((r) => String(r[i] ?? '').length));
    ws.getColumn(i + 1).width = Math.min(60, Math.max(10, longest + 2));
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * PDF tabel A4 mendatar: judul, waktu cetak, kepala kolom yang diulang di setiap halaman, nomor halaman.
 * Lebar kolom dibagi menurut panjang isi rata-rata; teks panjang dibungkus.
 */
export function toPdf(title: string, subtitle: string, columns: string[], rows: Cell[][]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true, info: { Title: title } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const sample = rows.slice(0, 200);
    const weight = columns.map((c, i) => Math.max(c.length, Math.min(40, sample.reduce((n, r) => n + String(r[i] ?? '').length, 0) / Math.max(1, sample.length))) + 4);
    const total = weight.reduce((a, b) => a + b, 0);
    const widths = weight.map((w) => (w / total) * width);
    const text = (v: Cell) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? '' : String(v));

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#16173a').text(title, left, doc.y);
    doc.font('Helvetica').fontSize(9).fillColor('#5f6280').text(subtitle);
    doc.moveDown(0.6);

    const rowHeight = (cells: string[], font: string) => {
      doc.font(font).fontSize(8.5);
      return Math.max(...cells.map((c, i) => doc.heightOfString(c, { width: widths[i] - 8 }))) + 8;
    };
    const drawRow = (cells: string[], header: boolean, y: number, h: number) => {
      if (header) doc.rect(left, y, width, h).fill('#ecedf7');
      let x = left;
      doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor('#16173a');
      cells.forEach((c, i) => { doc.text(c, x + 4, y + 4, { width: widths[i] - 8 }); x += widths[i]; });
      doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.5).strokeColor('#e3e5ee').stroke();
    };
    const bottom = () => doc.page.height - doc.page.margins.bottom - 14;
    const headH = rowHeight(columns, 'Helvetica-Bold');
    let y = doc.y;
    drawRow(columns, true, y, headH); y += headH;
    if (rows.length === 0) { doc.font('Helvetica').fontSize(9).fillColor('#5f6280').text('Tidak ada data.', left + 4, y + 6); }
    for (const r of rows) {
      const cells = r.map(text);
      const h = rowHeight(cells, 'Helvetica');
      if (y + h > bottom()) { doc.addPage(); y = doc.page.margins.top; drawRow(columns, true, y, headH); y += headH; }
      drawRow(cells, false, y, h); y += h;
    }
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(8).fillColor('#5f6280').text(`Halaman ${i + 1} dari ${range.count}`, left, doc.page.height - doc.page.margins.bottom - 4, { width, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}

/** Baca lembar pertama .xlsx menjadi daftar baris; kunci = judul kolom yang dinormalkan (huruf kecil, spasi jadi _). */
export async function readXlsx(buffer: Buffer, maxRows = 1000): Promise<{ rows: Record<string, string>[]; headers: string[] }> {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer as unknown as ArrayBuffer); } catch { throw invalid('File tidak dapat dibaca. Pastikan berformat Excel (.xlsx)'); }
  const ws = wb.worksheets[0];
  if (!ws) throw invalid('File Excel tidak berisi lembar kerja');
  const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const cellText = (v: ExcelJS.CellValue): string => {
    if (v == null) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'object') {
      if ('text' in v && typeof v.text === 'string') return v.text;
      if ('result' in v) return cellText(v.result as ExcelJS.CellValue);
      if ('richText' in v) return v.richText.map((t) => t.text).join('');
    }
    return String(v).trim();
  };
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { headers[i - 1] = norm(cellText(c.value)); });
  const rows: Record<string, string>[] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { if (h) o[h] = cellText(row.getCell(i + 1).value).trim(); });
    if (Object.values(o).some(Boolean)) rows.push(o);
  });
  if (rows.length > maxRows) throw invalid(`Maksimal ${maxRows} baris per impor`);
  return { rows, headers };
}
