import { idParam, route } from '@/server/http/handler';
import * as lettersOut from '@/server/application/letters-out';

export const POST = route<{ id: string }>(async ({ deps, ctx, params, body }) => lettersOut.send(deps, ctx, idParam(params.id), (await body()).fields));

export const dynamic = 'force-dynamic';
