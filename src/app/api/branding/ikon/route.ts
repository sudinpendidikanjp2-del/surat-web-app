import { route } from '@/server/http/handler';
import * as admin from '@/server/application/admin';

/** Ikon aplikasi (favicon). Publik karena tampil juga di halaman masuk dan halaman lacak. */
export const GET = route(async ({ deps }) => {
  const i = await admin.brandIcon(deps);
  return new Response(new Uint8Array(i.body), { headers: { 'Content-Type': i.mime, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' } });
}, { auth: false });

export const POST = route(async ({ deps, ctx, body }) => admin.saveBrandIcon(deps, ctx, (await body()).file('file')));
export const DELETE = route(async ({ deps, ctx }) => admin.removeBrandIcon(deps, ctx));

export const dynamic = 'force-dynamic';
