import { route } from '@/server/http/handler';
import * as lettersIn from '@/server/application/letters-in';
import { IMPORT_TEMPLATES } from '@/server/application/reference';
import { importTemplate, readImport } from '@/server/http/import';

export const GET = route(async () => importTemplate('surat-masuk', IMPORT_TEMPLATES['surat-masuk']));
export const POST = route(async ({ deps, ctx, body }) => lettersIn.importRows(deps, ctx, await readImport(await body())));

export const dynamic = 'force-dynamic';
