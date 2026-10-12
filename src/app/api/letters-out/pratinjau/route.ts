import { route } from '@/server/http/handler';
import * as lettersOut from '@/server/application/letters-out';

export const POST = route(async ({ deps, ctx, body }) => lettersOut.previewDraft(deps, ctx, (await body()).fields));

export const dynamic = 'force-dynamic';
