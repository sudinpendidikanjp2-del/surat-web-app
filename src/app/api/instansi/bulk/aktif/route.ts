import { route } from '@/server/http/handler';
import * as ref from '@/server/application/reference';

export const POST = route(async ({ deps, ctx, body }) => ref.setInstansiActive(deps, ctx, (await body()).fields));

export const dynamic = 'force-dynamic';
