import { created, route } from '@/server/http/handler';
import * as lettersOut from '@/server/application/letters-out';
import { csv, today } from '@/server/http/responses';

export const GET = route(async ({ deps, ctx, query }) => {
  if (query.format === 'csv') {
    const t = await lettersOut.exportRows(deps, ctx, query);
    return csv(`surat-keluar-${today()}.csv`, t.columns, t.rows);
  }
  return lettersOut.list(deps, ctx, query);
});

export const POST = route(async ({ deps, ctx, body }) => created(await lettersOut.create(deps, ctx, (await body()).fields)));

export const dynamic = 'force-dynamic';
