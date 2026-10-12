import { created, idParam, route } from '@/server/http/handler';
import * as lettersOut from '@/server/application/letters-out';

export const POST = route<{ id: string }>(async ({ deps, ctx, params, body }) => {
  await lettersOut.comment(deps, ctx, idParam(params.id), (await body()).fields);
  return created({ ok: true });
});

export const dynamic = 'force-dynamic';
