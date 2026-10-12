import { created, route } from '@/server/http/handler';
import * as templates from '@/server/application/templates';

export const GET = route(async ({ deps, ctx }) => templates.list(deps, ctx));

export const POST = route(async ({ deps, ctx, body }) => {
  const b = await body();
  return created(await templates.create(deps, ctx, b.fields, b.file('file')));
});

export const dynamic = 'force-dynamic';
