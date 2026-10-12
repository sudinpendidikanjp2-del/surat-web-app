import { json, route } from '@/server/http/handler';
import * as files from '@/server/application/files';

export const GET = route<{ code: string }>(async ({ deps, anon, params }) => {
  const res = json(await files.track(deps, anon, params.code));
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}, { auth: false });

export const dynamic = 'force-dynamic';
