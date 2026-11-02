import { route } from '@/server/http/handler';
import * as ref from '@/server/application/reference';

export const GET = route(async ({ deps }) => ref.instansiOptions(deps));

export const dynamic = 'force-dynamic';
