import { idParam, route } from '@/server/http/handler';
import * as dispositions from '@/server/application/dispositions';

export const POST = route<{ id: string }>(async ({ deps, ctx, params, body }) => dispositions.giveBack(deps, ctx, idParam(params.id), (await body()).fields));

export const dynamic = 'force-dynamic';
