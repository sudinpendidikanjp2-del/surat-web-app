import { route } from '@/server/http/handler';
import { toPublicUser } from '@/domain/roles';

export const GET = route(async ({ actor }) => ({ user: actor ? toPublicUser(actor) : null }), { auth: false });

export const dynamic = 'force-dynamic';
