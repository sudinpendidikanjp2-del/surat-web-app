import { route } from '@/server/http/handler';
import * as auth from '@/server/application/auth';

export const POST = route(async ({ deps, ctx, token, body }) => auth.changePassword(deps, ctx, token!, (await body()).fields));

export const dynamic = 'force-dynamic';
