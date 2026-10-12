import { idParam, route } from '@/server/http/handler';
import * as tasks from '@/server/application/tasks';

export const GET = route<{ id: string }>(async ({ deps, ctx, params }) => tasks.detail(deps, ctx, idParam(params.id)));

export const PUT = route<{ id: string }>(async ({ deps, ctx, params, body }) => tasks.update(deps, ctx, idParam(params.id), (await body()).fields));

export const dynamic = 'force-dynamic';
