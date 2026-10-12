import { route } from '@/server/http/handler';
import * as lettersOut from '@/server/application/letters-out';

export const GET = route(async ({ deps, ctx, query }) => lettersOut.ids(deps, ctx, query));

export const dynamic = 'force-dynamic';
