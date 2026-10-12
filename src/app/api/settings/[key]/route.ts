import { route } from '@/server/http/handler';
import * as admin from '@/server/application/admin';

export const PUT = route<{ key: string }>(async ({ deps, ctx, params, body }) => admin.saveSetting(deps, ctx, params.key, (await body()).fields));

export const dynamic = 'force-dynamic';
