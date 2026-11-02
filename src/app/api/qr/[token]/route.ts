import { route } from '@/server/http/handler';
import * as lettersIn from '@/server/application/letters-in';

export const GET = route<{ token: string }>(async ({ deps, params }) => lettersIn.resolveQr(deps, params.token));

export const dynamic = 'force-dynamic';
