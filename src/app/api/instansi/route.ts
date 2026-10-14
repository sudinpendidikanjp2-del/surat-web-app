import { created, route } from '@/server/http/handler';
import * as ref from '@/server/application/reference';
import { exportTable, isExport } from '@/server/http/responses';

export const GET = route(async ({ deps, ctx, query }) => {
  if (isExport(query.format)) {
    const t = await ref.exportInstansi(deps, ctx, query);
    return exportTable(query.format, 'instansi', 'Daftar Instansi', t.columns, t.rows);
  }
  return ref.listInstansi(deps, ctx, query);
});
export const POST = route(async ({ deps, ctx, body }) => created(await ref.createInstansi(deps, ctx, (await body()).fields)));

export const dynamic = 'force-dynamic';
