import { route } from '@/server/http/handler';
import * as backup from '@/server/application/backup';

export const POST = route<{ nama: string }>(async ({ deps, ctx, params, body }) => backup.restore(deps, ctx, params.nama, (await body()).fields));

export const dynamic = 'force-dynamic';
// Pemulihan arsip besar dapat memakan waktu beberapa menit.
export const maxDuration = 900;
