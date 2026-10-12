import { created, route } from '@/server/http/handler';
import * as admin from '@/server/application/admin';

export const GET = route(async ({ deps, ctx, query }) => admin.listUsers(deps, ctx, query));

export const POST = route(async ({ deps, ctx, body }) => created(await admin.createUser(deps, ctx, (await body()).fields)));

export const dynamic = 'force-dynamic';
