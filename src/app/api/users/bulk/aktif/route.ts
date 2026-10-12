import { route } from '@/server/http/handler';
import * as admin from '@/server/application/admin';

export const POST = route(async ({ deps, ctx, body }) => admin.setUsersActive(deps, ctx, (await body()).fields));

export const dynamic = 'force-dynamic';
