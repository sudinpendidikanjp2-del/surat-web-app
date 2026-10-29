import { route } from '@/server/http/handler';
import { streamFile } from '@/server/http/responses';
import * as backup from '@/server/application/backup';

type P = { nama: string };

export const GET = route<P>(async ({ deps, ctx, params }) => {
  const f = await backup.download(deps, ctx, params.nama);
  return streamFile(f.path, { mime: 'application/gzip', filename: f.filename });
});
export const DELETE = route<P>(async ({ deps, ctx, params }) => backup.remove(deps, ctx, params.nama));

export const dynamic = 'force-dynamic';
