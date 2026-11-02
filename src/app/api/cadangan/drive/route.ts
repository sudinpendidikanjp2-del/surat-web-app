import { created, route } from '@/server/http/handler';
import * as backup from '@/server/application/backup';

export const GET = route(async ({ deps, ctx }) => backup.driveList(deps, ctx));
/** Ambil satu cadangan dari Google Drive ke server agar dapat dipulihkan. */
export const POST = route(async ({ deps, ctx, body }) => created(await backup.fetchFromDrive(deps, ctx, (await body()).fields.file_id)));

export const dynamic = 'force-dynamic';
export const maxDuration = 900;
