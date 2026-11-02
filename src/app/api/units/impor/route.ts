import { route } from '@/server/http/handler';
import * as admin from '@/server/application/admin';
import { IMPORT_TEMPLATES } from '@/server/application/reference';
import { importTemplate, readImport } from '@/server/http/import';

export const GET = route(async () => importTemplate('unit', IMPORT_TEMPLATES.unit));
export const POST = route(async ({ deps, ctx, body }) => admin.importUnits(deps, ctx, await readImport(await body())));

export const dynamic = 'force-dynamic';
