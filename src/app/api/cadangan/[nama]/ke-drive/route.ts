import { route } from '@/server/http/handler';
import * as backup from '@/server/application/backup';

export const POST = route<{ nama: string }>(async ({ deps, ctx, params }) => backup.copyToDrive(deps, ctx, params.nama));

export const dynamic = 'force-dynamic';
