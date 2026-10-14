import 'server-only';
import { invalid } from '@/domain/errors';
import type { Body } from './request';
import { exportTable } from './responses';

/** Ambil file "file" dari formulir, pastikan .xlsx, lalu baca lembar pertamanya. */
export async function readImport(b: Body) {
  const f = b.file('file');
  if (!f) throw invalid('Pilih file Excel (.xlsx) untuk diimpor');
  if (!f.name.toLowerCase().endsWith('.xlsx') || f.buffer.subarray(0, 2).toString() !== 'PK') throw invalid('File harus berformat Excel (.xlsx)');
  if (f.buffer.length > 5 * 1024 * 1024) throw invalid('File impor maksimal 5 MB');
  const { readXlsx } = await import('@/server/infrastructure/spreadsheet/tables');
  return (await readXlsx(f.buffer)).rows;
}

/** Contoh file impor: judul kolom dan satu baris contoh. */
export const importTemplate = (name: string, t: { columns: readonly string[]; example: readonly string[] }) =>
  exportTable('xlsx', `contoh-impor-${name}`, 'Contoh', [...t.columns], [[...t.example]]);
