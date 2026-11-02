import { route } from '@/server/http/handler';
import * as lettersOut from '@/server/application/letters-out';

export const POST = route(async ({ deps, ctx, body }) => lettersOut.submitMany(deps, ctx, (await body()).fields.ids));

export const dynamic = 'force-dynamic';
