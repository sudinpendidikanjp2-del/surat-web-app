import { route } from '@/server/http/handler';
import * as ref from '@/server/application/reference';
import { importTemplate, readImport } from '@/server/http/import';

export const GET = route(async () => importTemplate('instansi', ref.IMPORT_TEMPLATES.instansi));
export const POST = route(async ({ deps, ctx, body }) => ref.importInstansi(deps, ctx, await readImport(await body())));

export const dynamic = 'force-dynamic';
