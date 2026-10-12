import { created, idParam, route } from '@/server/http/handler';
import * as lettersIn from '@/server/application/letters-in';

export const POST = route<{ id: string }>(async ({ deps, ctx, params, body }) => created(await lettersIn.assignTask(deps, ctx, idParam(params.id), (await body()).fields)));

export const dynamic = 'force-dynamic';
