import { route } from '@/server/http/handler';
import * as insight from '@/server/application/insight';

export const GET = route(async ({ deps, ctx, query }) => insight.search(deps, ctx, query));

export const dynamic = 'force-dynamic';
