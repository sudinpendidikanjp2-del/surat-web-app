import { route } from '@/server/http/handler';
import * as files from '@/server/application/files';

export const POST = route(async ({ deps, ctx, body }) => files.readLetterPhoto(deps, ctx, (await body()).file('foto')));
export const maxDuration = 120;

export const dynamic = 'force-dynamic';
