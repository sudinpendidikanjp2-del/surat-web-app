import { route } from '@/server/http/handler';
import * as lettersIn from '@/server/application/letters-in';

export const GET = route(async ({ deps, ctx, query }) => lettersIn.ids(deps, ctx, query));

export const dynamic = 'force-dynamic';
