import { created, idParam, route } from '@/server/http/handler';
import * as lettersOut from '@/server/application/letters-out';

export const POST = route<{ id: string }>(async ({ deps, ctx, params, body }) => {
  const b = await body();
  // kategori: TTD (pindaian surat bertanda tangan) atau PENDUKUNG.
  await lettersOut.uploadDocuments(deps, ctx, idParam(params.id), b.files('files'), b.fields.kategori);
  return created({ ok: true });
});

export const dynamic = 'force-dynamic';
