import { idParam, route } from '@/server/http/handler';
import * as tasks from '@/server/application/tasks';

export const POST = route<{ id: string }>(async ({ deps, ctx, params, body }) => {
  const b = await body();
  return tasks.progress(deps, ctx, idParam(params.id), b.fields, b.files('files'));
});

export const dynamic = 'force-dynamic';
