import { route } from '@/server/http/handler';
import * as admin from '@/server/application/admin';

export const GET = route(async ({ deps, ctx, query }) => admin.notifications(deps, ctx, query));

export const dynamic = 'force-dynamic';
