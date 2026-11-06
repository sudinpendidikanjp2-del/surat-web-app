import { route } from '@/server/http/handler';
import * as generator from '@/server/application/generator';
import { file } from '@/server/http/responses';

/** Buat Surat dari template: pratinjau HTML; dengan ?format=docx|pdf mengembalikan file untuk diunduh. Tidak menyimpan apa pun. */
export const POST = route(async ({ deps, ctx, body, query }) => {
  const fields = (await body()).fields;
  if (query.format) {
    const f = await generator.download(deps, ctx, fields, query.format);
    return file(f.body, { mime: f.mime, filename: f.filename });
  }
  return generator.preview(deps, ctx, fields);
});

export const dynamic = 'force-dynamic';
