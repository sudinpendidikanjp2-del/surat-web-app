import { route } from '@/server/http/handler';
import * as lettersOut from '@/server/application/letters-out';
import { file } from '@/server/http/responses';

/** Pratinjau HTML dari isian yang belum disimpan; dengan ?format=docx|pdf mengembalikan file untuk diunduh. */
export const POST = route(async ({ deps, ctx, body, query }) => {
  const fields = (await body()).fields;
  if (query.format) {
    const f = await lettersOut.downloadDraft(deps, ctx, fields, query.format);
    return file(f.body, { mime: f.mime, filename: f.filename });
  }
  return lettersOut.previewDraft(deps, ctx, fields);
});

export const dynamic = 'force-dynamic';
