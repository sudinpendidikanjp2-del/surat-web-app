import { route } from '@/server/http/handler';
import * as tasks from '@/server/application/tasks';
import { exportTable, isExport } from '@/server/http/responses';

export const GET = route(async ({ deps, ctx, query }) => {
  if (isExport(query.format)) {
    const t = await tasks.exportRows(deps, ctx, query);
    return exportTable(query.format, 'tugas', 'Daftar Tugas', t.columns, t.rows);
  }
  return tasks.list(deps, ctx, query);
});

export const dynamic = 'force-dynamic';
