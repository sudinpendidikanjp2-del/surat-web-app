import { NextResponse } from 'next/server';
import { route } from '@/server/http/handler';
import * as google from '@/server/application/google';

/** Google mengarahkan peramban ke sini setelah persetujuan; hasilnya ditampilkan di halaman integrasi. */
export const GET = route(async ({ deps, ctx, query }) => {
  const r = await google.oauthCallback(deps, ctx, query);
  const url = new URL('/google', ctx.baseUrl);
  url.searchParams.set(r.ok ? 'berhasil' : 'galat', r.pesan);
  return NextResponse.redirect(url, 303);
});

export const dynamic = 'force-dynamic';
