import { idParam, route } from '@/server/http/handler';
import * as lettersOut from '@/server/application/letters-out';
import { file } from '@/server/http/responses';

export const GET = route<{ id: string }>(async ({ deps, ctx, params, query }) => {
  const d = await lettersOut.download(deps, ctx, idParam(params.id), query.format);
  return file(d.body, { mime: d.mime, filename: d.filename });
});

export const dynamic = 'force-dynamic';
