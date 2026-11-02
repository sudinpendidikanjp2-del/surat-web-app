import { idParam, route } from '@/server/http/handler';
import * as templates from '@/server/application/templates';

export const PUT = route<{ id: string; vid: string }>(async ({ deps, ctx, params, body }) => templates.updateFields(deps, ctx, idParam(params.id), idParam(params.vid), (await body()).fields));

export const dynamic = 'force-dynamic';
