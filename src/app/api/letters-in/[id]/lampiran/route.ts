import { created, idParam, route } from '@/server/http/handler';
import * as lettersIn from '@/server/application/letters-in';

export const POST = route<{ id: string }>(async ({ deps, ctx, params, body }) => {
  const b = await body();
  return created(await lettersIn.uploadDocuments(deps, ctx, idParam(params.id), b.fields, b.files('files')));
});

export const dynamic = 'force-dynamic';
