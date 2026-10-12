import { idParam, route } from '@/server/http/handler';
import * as templates from '@/server/application/templates';

export const GET = route<{ id: string; vid: string }>(async ({ deps, ctx, params }) => templates.previewVersion(deps, ctx, idParam(params.id), idParam(params.vid)));

export const dynamic = 'force-dynamic';
