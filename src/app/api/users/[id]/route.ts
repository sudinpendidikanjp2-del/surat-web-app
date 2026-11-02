import { idParam, route } from '@/server/http/handler';
import * as admin from '@/server/application/admin';

export const PUT = route<{ id: string }>(async ({ deps, ctx, params, body }) => admin.updateUser(deps, ctx, idParam(params.id), (await body()).fields));

export const dynamic = 'force-dynamic';
