import { route } from '@/server/http/handler';
import * as insight from '@/server/application/insight';
import { exportTable, isExport } from '@/server/http/responses';
import { int } from '@/domain/validation';

export const GET = route<{ jenis: string }>(async ({ deps, ctx, params, query }) => {
  const r = await insight.report(deps, ctx, params.jenis, query);
  if (!isExport(query.format)) return r;
  const idx = Math.min(int(query.tabel, 'Tabel', { required: false, min: 0 }) ?? r.tables.length - 1, r.tables.length - 1);
  const t = r.tables[idx];
  return exportTable(query.format, `laporan-${r.jenis}-${r.from}_${r.to}`, `${t.judul} (${r.from} sampai ${r.to})`, t.columns, t.rows);
});

export const dynamic = 'force-dynamic';
