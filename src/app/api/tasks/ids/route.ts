import { route } from '@/server/http/handler';
import * as tasks from '@/server/application/tasks';

export const GET = route(async ({ deps, ctx, query }) => tasks.ids(deps, ctx, query));

export const dynamic = 'force-dynamic';
