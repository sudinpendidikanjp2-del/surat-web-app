import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, dynamicSecurityHeaders, generateNonce } from '@/lib/security-headers';

/**
 * Proxy (lapisan tambahan, bukan pemeriksa izin):
 *  1. memasang CSP bernonce dan HSTS pada setiap halaman; nonce diteruskan lewat header permintaan agar
 *     Next.js dan skrip tema memakainya;
 *  2. menyimpan alamat yang diminta di header, agar layout dapat mengirim orang yang belum masuk ke
 *     /masuk?lanjut=<alamat> dan, setelah masuk, membawanya kembali ke halaman yang tadi dibuka.
 * Sesi dan izin selalu diperiksa ulang di server (layout dan use case).
 */
export function proxy(req: NextRequest) {
  const nonce = generateNonce();
  const appUrl = process.env.APP_URL ?? '';
  const csp = buildCsp({ nonce, dev: process.env.NODE_ENV !== 'production', https: appUrl.startsWith('https://') });

  const headers = new Headers(req.headers);
  headers.set('x-surat-path', req.nextUrl.pathname + req.nextUrl.search);
  headers.set('x-nonce', nonce);
  // Next.js membaca nonce dari header CSP permintaan dan memasangnya pada skrip yang disisipkannya.
  headers.set('Content-Security-Policy', csp);

  const res = NextResponse.next({ request: { headers } });
  for (const [k, v] of Object.entries(dynamicSecurityHeaders({ appUrl, csp }))) res.headers.set(k, v);
  return res;
}

// API menetapkan header sendiri (berkas memakai CSP sandbox); aset statis dan pemeriksaan kesehatan tidak perlu CSP.
export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon|healthz|readyz).*)'] };
