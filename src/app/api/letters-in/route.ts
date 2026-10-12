import { created, route } from '@/server/http/handler';
import * as lettersIn from '@/server/application/letters-in';
import { csv, today } from '@/server/http/responses';

export const GET = route(async ({ deps, ctx, query }) => {
  if (query.format === 'csv') {
    const t = await lettersIn.exportRows(deps, ctx, query);
    return csv(`surat-masuk-${today()}.csv`, t.columns, t.rows);
  }
  return lettersIn.list(deps, ctx, query);
});

export const POST = route(async ({ deps, ctx, body }) => {
  const b = await body();
  return created(await lettersIn.create(deps, ctx, b.fields, b.files('files')));
});

export const dynamic = 'force-dynamic';
