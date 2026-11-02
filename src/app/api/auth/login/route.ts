import { SESSION_COOKIE, route } from '@/server/http/handler';
import * as auth from '@/server/application/auth';
import { NextResponse } from 'next/server';
import { config } from '@/server/config';

export const POST = route(async ({ deps, anon, body, req }) => {
  const { user, token } = await auth.login(deps, anon, (await body()).fields);
  const res = NextResponse.json({ user });
  const secure = config.production || req.headers.get('x-forwarded-proto') === 'https';
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'strict', path: '/', maxAge: deps.sessionHours * 3600, secure });
  return res;
}, { auth: false });

export const dynamic = 'force-dynamic';
