import { route } from '@/server/http/handler';
import * as google from '@/server/application/google';

export const POST = route(async ({ deps, ctx }) => google.syncNow(deps, ctx));

export const dynamic = 'force-dynamic';
