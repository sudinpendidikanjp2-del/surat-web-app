import { route } from '@/server/http/handler';
import * as insight from '@/server/application/insight';

export const GET = route(async ({ deps, ctx }) => insight.archiveTree(deps, ctx));

export const dynamic = 'force-dynamic';
