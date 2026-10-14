import { created, route } from '@/server/http/handler';
import * as ref from '@/server/application/reference';
import { exportTable, isExport } from '@/server/http/responses';

export const GET = route(async ({ deps, ctx, query }) => {
  if (isExport(query.format)) {
    const t = await ref.exportRefs(deps, ctx, query.kategori);
    return exportTable(query.format, `referensi-${query.kategori}`, t.title, t.columns, t.rows);
  }
  return ref.listRefs(deps, ctx, query);
});
export const POST = route(async ({ deps, ctx, body }) => created(await ref.createRef(deps, ctx, (await body()).fields)));

export const dynamic = 'force-dynamic';
