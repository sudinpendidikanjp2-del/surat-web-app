import { idParam, route } from '@/server/http/handler';
import * as templates from '@/server/application/templates';

export const GET = route<{ id: string }>(async ({ deps, ctx, params }) => templates.detail(deps, ctx, idParam(params.id)));

export const PUT = route<{ id: string }>(async ({ deps, ctx, params, body }) => templates.update(deps, ctx, idParam(params.id), (await body()).fields));

export const dynamic = 'force-dynamic';
