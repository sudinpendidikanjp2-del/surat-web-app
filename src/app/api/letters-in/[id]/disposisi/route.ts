import { created, idParam, route } from '@/server/http/handler';
import * as lettersIn from '@/server/application/letters-in';

export const POST = route<{ id: string }>(async ({ deps, ctx, params, body }) => {
  await lettersIn.dispose(deps, ctx, idParam(params.id), (await body()).fields);
  return created({ ok: true });
});

export const dynamic = 'force-dynamic';
