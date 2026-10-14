import { route } from '@/server/http/handler';
import * as ref from '@/server/application/reference';
import { importTemplate, readImport } from '@/server/http/import';

export const GET = route(async () => importTemplate('referensi', ref.IMPORT_TEMPLATES.referensi));
export const POST = route(async ({ deps, ctx, body }) => {
  const b = await body();
  return ref.importRefs(deps, ctx, b.fields.kategori, await readImport(b));
});

export const dynamic = 'force-dynamic';
