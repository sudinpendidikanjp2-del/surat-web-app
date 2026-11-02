import { idParam, route } from '@/server/http/handler';
import * as lettersIn from '@/server/application/letters-in';

export const GET = route<{ id: string }>(async ({ deps, ctx, params }) => lettersIn.detail(deps, ctx, idParam(params.id)));

export const PUT = route<{ id: string }>(async ({ deps, ctx, params, body }) => lettersIn.update(deps, ctx, idParam(params.id), (await body()).fields));

export const dynamic = 'force-dynamic';
