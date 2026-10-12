import { NextResponse, type NextRequest } from 'next/server';

/**
 * Menyimpan alamat yang diminta di header, agar layout dapat mengirim orang yang belum masuk ke
 * /masuk?lanjut=<alamat> dan, setelah masuk, membawanya kembali ke halaman yang tadi dibuka.
 */
export function proxy(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set('x-surat-path', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/((?!api|_next|lacak|masuk|healthz|readyz|favicon).*)'] };
