import { route } from '@/server/http/handler';
import * as admin from '@/server/application/admin';

export const GET = route(async ({ deps }) => admin.settings(deps));

export const dynamic = 'force-dynamic';
