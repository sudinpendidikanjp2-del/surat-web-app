import { idParam, route } from '@/server/http/handler';
import * as lettersIn from '@/server/application/letters-in';

export const GET = route<{ id: string }>(async ({ deps, ctx, params }) => lettersIn.receipt(deps, ctx, idParam(params.id)));

export const dynamic = 'force-dynamic';
