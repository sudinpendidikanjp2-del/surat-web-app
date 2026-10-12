import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { isAppError, type ErrorKind } from '@/domain/errors';
import type { Actor } from '@/domain/roles';
import { int } from '@/domain/validation';
import type { AnonCtx, Ctx, Deps } from '@/server/application/context';
import { resolveSession } from '@/server/application/auth';
import { deps } from '@/server/container';
import { readBody, type Body } from './request';

export const SESSION_COOKIE = 'sid';

const STATUS: Record<ErrorKind, number> = {
  invalid: 400, unauthenticated: 401, forbidden: 403, not_found: 404, conflict: 409, rate_limited: 429, unavailable: 501,
};

export interface HttpCtx<P> {
  req: NextRequest;
  params: P;
  deps: Deps;
  /** Ada bila rute memerlukan login. */
  ctx: Ctx;
  anon: AnonCtx;
  actor: Actor | null;
  token: string | undefined;
  query: Record<string, string>;
  body: () => Promise<Body>;
}

const ipOf = (req: NextRequest) => req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
export const baseUrlOf = (req: NextRequest) => {
  const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host;
  return `${proto}://${host}`;
};

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const created = (data: unknown) => json(data, 201);
const fail = (status: number, error: string) => json({ error }, status);

/**
 * Adaptor route handler. Urutan: CSRF (header kustom pada metode yang mengubah data), sesi dari cookie,
 * wajib login bila `auth`, lalu use case. Kesalahan domain diterjemahkan ke kode HTTP di satu tempat.
 */
export function route<P = Record<string, unknown>>(
  fn: (h: HttpCtx<P>) => Promise<unknown>,
  { auth = true }: { auth?: boolean } = {},
) {
  return async (req: NextRequest, segment: { params: Promise<P> }) => {
    try {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.get('x-requested-with') !== 'surat-app') {
        return fail(403, 'Permintaan ditolak (CSRF)');
      }
      const d = deps();
      const token = req.cookies.get(SESSION_COOKIE)?.value;
      const actor = await resolveSession(d, token);
      if (auth && !actor) return fail(401, 'Sesi berakhir. Silakan masuk kembali');
      const anon = { ip: ipOf(req), baseUrl: baseUrlOf(req) };
      let cached: Promise<Body> | null = null;
      const out = await fn({
        req, deps: d, params: await segment.params, actor, token, anon,
        ctx: { ...anon, actor: actor! },
        query: Object.fromEntries(req.nextUrl.searchParams),
        body: () => (cached ??= readBody(req)),
      });
      return out instanceof Response ? out : json(out ?? { ok: true });
    } catch (e) {
      return toErrorResponse(e, req);
    }
  };
}

function toErrorResponse(e: unknown, req: NextRequest) {
  if (isAppError(e)) return fail(STATUS[e.kind], e.message);
  const code = (e as { code?: string })?.code;
  if (code === '23505') return fail(409, 'Data duplikat. Nilai tersebut sudah ada');
  if (code === '23503') return fail(409, 'Data terkait tidak ditemukan atau masih dipakai');
  if (e instanceof SyntaxError) return fail(400, 'Format permintaan tidak valid');
  console.error(`${req.method} ${req.nextUrl.pathname}`, e);
  return fail(500, 'Terjadi kesalahan pada server');
}

/** ID numerik dari segmen URL; selain bilangan bulat ditolak dengan 400. */
export const idParam = (v: string) => int(v, 'ID', { min: 1 });
