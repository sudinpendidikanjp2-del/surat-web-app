import { idParam, route } from '@/server/http/handler';
import * as files from '@/server/application/files';
import { file } from '@/server/http/responses';

const INLINE = new Set(['application/pdf', 'image/png', 'image/jpeg']);
export const GET = route<{ id: string }>(async ({ deps, ctx, params, query }) => {
  const a = await files.openAttachment(deps, ctx, idParam(params.id));
  return file(a.body, { mime: a.mime, filename: a.nama, inline: INLINE.has(a.mime) && query.unduh !== '1' });
});

export const dynamic = 'force-dynamic';
