import { route } from '@/server/http/handler';
import * as backup from '@/server/application/backup';

export const PUT = route(async ({ deps, ctx, body }) => backup.saveSchedule(deps, ctx, (await body()).fields));

export const dynamic = 'force-dynamic';
