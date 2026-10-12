import { route } from '@/server/http/handler';
import * as dispositions from '@/server/application/dispositions';

export const POST = route(async ({ deps, ctx, body }) => dispositions.acceptMany(deps, ctx, (await body()).fields.ids));

export const dynamic = 'force-dynamic';
