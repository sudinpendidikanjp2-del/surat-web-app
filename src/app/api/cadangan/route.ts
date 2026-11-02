import { created, route } from '@/server/http/handler';
import * as backup from '@/server/application/backup';

export const GET = route(async ({ deps, ctx }) => backup.overview(deps, ctx));
export const POST = route(async ({ deps, ctx, body }) => created(await backup.create(deps, ctx, (await body()).fields)));

export const dynamic = 'force-dynamic';
