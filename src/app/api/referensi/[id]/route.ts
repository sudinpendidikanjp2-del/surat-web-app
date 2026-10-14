import { idParam, route } from '@/server/http/handler';
import * as ref from '@/server/application/reference';

export const PUT = route<{ id: string }>(async ({ deps, ctx, params, body }) => ref.updateRef(deps, ctx, idParam(params.id), (await body()).fields));

export const dynamic = 'force-dynamic';
