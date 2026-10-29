import { route } from '@/server/http/handler';
import * as google from '@/server/application/google';

export const GET = route(async ({ deps, ctx }) => google.status(deps, ctx));
export const PUT = route(async ({ deps, ctx, body }) => google.save(deps, ctx, (await body()).fields));
export const DELETE = route(async ({ deps, ctx }) => google.disconnect(deps, ctx));

export const dynamic = 'force-dynamic';
