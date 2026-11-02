import { SESSION_COOKIE, route } from '@/server/http/handler';
import * as auth from '@/server/application/auth';
import { NextResponse } from 'next/server';

export const POST = route(async ({ deps, ctx, token }) => {
  await auth.logout(deps, ctx, token!);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 });
  return res;
});

export const dynamic = 'force-dynamic';
