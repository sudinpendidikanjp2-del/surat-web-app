import { idParam, route } from '@/server/http/handler';
import * as templates from '@/server/application/templates';
import { file } from '@/server/http/responses';

export const GET = route<{ id: string; vid: string }>(async ({ deps, ctx, params }) => {
  const d = await templates.downloadVersion(deps, ctx, idParam(params.id), idParam(params.vid));
  return file(d.body, { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', filename: d.filename });
});

export const dynamic = 'force-dynamic';
