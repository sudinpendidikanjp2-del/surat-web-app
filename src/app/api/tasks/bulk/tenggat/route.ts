import { route } from '@/server/http/handler';
import * as tasks from '@/server/application/tasks';

export const POST = route(async ({ deps, ctx, body }) => tasks.setDeadlineMany(deps, ctx, (await body()).fields));

export const dynamic = 'force-dynamic';
