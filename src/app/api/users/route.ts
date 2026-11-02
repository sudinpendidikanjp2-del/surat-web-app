import { created, route } from '@/server/http/handler';
import * as admin from '@/server/application/admin';
import { exportTable, isExport } from '@/server/http/responses';

export const GET = route(async ({ deps, ctx, query }) => {
  if (isExport(query.format)) {
    const t = await admin.exportUsers(deps, ctx, query);
    return exportTable(query.format, 'pengguna', 'Daftar Pengguna', t.columns, t.rows);
  }
  return admin.listUsers(deps, ctx, query);
});

export const POST = route(async ({ deps, ctx, body }) => created(await admin.createUser(deps, ctx, (await body()).fields)));

export const dynamic = 'force-dynamic';
