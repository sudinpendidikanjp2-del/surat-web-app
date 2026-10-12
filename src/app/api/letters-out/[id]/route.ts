import { idParam, route } from '@/server/http/handler';
import * as lettersOut from '@/server/application/letters-out';

export const GET = route<{ id: string }>(async ({ deps, ctx, params }) => lettersOut.detail(deps, ctx, idParam(params.id)));

export const PUT = route<{ id: string }>(async ({ deps, ctx, params, body }) => lettersOut.update(deps, ctx, idParam(params.id), (await body()).fields));

export const dynamic = 'force-dynamic';
