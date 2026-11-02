import { idParam, route } from '@/server/http/handler';
import * as dispositions from '@/server/application/dispositions';

export const POST = route<{ id: string }>(async ({ deps, ctx, params }) => dispositions.accept(deps, ctx, idParam(params.id)));

export const dynamic = 'force-dynamic';
