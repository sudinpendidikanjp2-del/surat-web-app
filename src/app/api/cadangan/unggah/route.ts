import { Readable } from 'node:stream';
import { invalid } from '@/domain/errors';
import { created, route } from '@/server/http/handler';
import * as backup from '@/server/application/backup';

/** Isi permintaan adalah file .tar.gz apa adanya (bukan multipart), dialirkan ke disk tanpa dimuat ke memori. */
export const POST = route(async ({ deps, ctx, req }) => {
  if (!req.body) throw invalid('Pilih file cadangan');
  return created(await backup.upload(deps, ctx, Readable.fromWeb(req.body as never)));
});

export const dynamic = 'force-dynamic';
export const maxDuration = 900;
