import { created, route } from '@/server/http/handler';
import * as admin from '@/server/application/admin';
import { exportTable, isExport } from '@/server/http/responses';

export const GET = route(async ({ deps, ctx, query }) => {
  if (isExport(query.format)) {
    const t = await admin.exportUnits(deps, ctx);
    return exportTable(query.format, 'unit-kerja', 'Daftar Unit Kerja', t.columns, t.rows);
  }
  return admin.listUnits(deps);
});

export const POST = route(async ({ deps, ctx, body }) => created(await admin.createUnit(deps, ctx, (await body()).fields)));

export const dynamic = 'force-dynamic';
