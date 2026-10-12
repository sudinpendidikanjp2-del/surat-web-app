import { created, idParam, route } from '@/server/http/handler';
import * as templates from '@/server/application/templates';

export const POST = route<{ id: string }>(async ({ deps, ctx, params, body }) => {
  const b = await body();
  return created(await templates.newVersion(deps, ctx, idParam(params.id), b.fields, b.file('file')));
});

export const dynamic = 'force-dynamic';
