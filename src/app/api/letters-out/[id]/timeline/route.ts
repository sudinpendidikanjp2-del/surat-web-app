import { idParam, route } from '@/server/http/handler';
import * as lettersOut from '@/server/application/letters-out';

export const GET = route<{ id: string }>(async ({ deps, ctx, params }) => lettersOut.timeline(deps, ctx, idParam(params.id)));

export const dynamic = 'force-dynamic';
