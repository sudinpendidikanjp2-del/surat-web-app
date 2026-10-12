import { route } from '@/server/http/handler';
import * as tasks from '@/server/application/tasks';
import { csv, today } from '@/server/http/responses';

export const GET = route(async ({ deps, ctx, query }) => {
  if (query.format === 'csv') {
    const t = await tasks.exportRows(deps, ctx, query);
    return csv(`tugas-${today()}.csv`, t.columns, t.rows);
  }
  return tasks.list(deps, ctx, query);
});

export const dynamic = 'force-dynamic';
