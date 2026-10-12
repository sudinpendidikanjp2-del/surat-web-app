import { route } from '@/server/http/handler';
import * as dispositions from '@/server/application/dispositions';

export const GET = route(async ({ deps, ctx, query }) => dispositions.ids(deps, ctx, query));

export const dynamic = 'force-dynamic';
