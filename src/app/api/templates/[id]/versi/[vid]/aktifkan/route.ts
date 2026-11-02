import { idParam, route } from '@/server/http/handler';
import * as templates from '@/server/application/templates';

export const POST = route<{ id: string; vid: string }>(async ({ deps, ctx, params }) => templates.activateVersion(deps, ctx, idParam(params.id), idParam(params.vid)));

export const dynamic = 'force-dynamic';
