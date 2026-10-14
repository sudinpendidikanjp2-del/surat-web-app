import { created, route } from '@/server/http/handler';
import * as lettersIn from '@/server/application/letters-in';
import { exportTable, isExport } from '@/server/http/responses';

export const GET = route(async ({ deps, ctx, query }) => {
  if (isExport(query.format)) {
    const t = await lettersIn.exportRows(deps, ctx, query);
    return exportTable(query.format, 'surat-masuk', 'Daftar Surat Masuk', t.columns, t.rows);
  }
  return lettersIn.list(deps, ctx, query);
});

export const POST = route(async ({ deps, ctx, body }) => {
  const b = await body();
  return created(await lettersIn.create(deps, ctx, b.fields, b.files('files')));
});

export const dynamic = 'force-dynamic';
