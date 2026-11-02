import { route } from '@/server/http/handler';
import * as lettersIn from '@/server/application/letters-in';

export const POST = route(async ({ deps, ctx, body }) => lettersIn.forwardMany(deps, ctx, (await body()).fields.ids));

export const dynamic = 'force-dynamic';
