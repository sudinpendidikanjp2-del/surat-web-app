import { test } from 'vitest';
import assert from 'node:assert/strict';
import { STATIC_SECURITY_HEADERS, buildCsp, dynamicSecurityHeaders, generateNonce } from '@/lib/security-headers';

test('CSP produksi: skrip hanya dengan nonce, tanpa unsafe-inline atau eval', () => {
  const csp = buildCsp({ nonce: 'abc', https: true });
  const script = csp.split('; ').find((d) => d.startsWith('script-src'))!;
  assert.equal(script, "script-src 'self' 'nonce-abc' 'strict-dynamic'");
  for (const d of ["object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", 'upgrade-insecure-requests']) assert.ok(csp.includes(d), d);
});

test('mode pengembangan mengizinkan eval dan WebSocket untuk HMR', () => {
  const csp = buildCsp({ nonce: 'abc', dev: true });
  assert.match(csp, /script-src [^;]*'unsafe-eval'/);
  assert.match(csp, /connect-src 'self' ws: wss:/);
  assert.doesNotMatch(csp, /upgrade-insecure-requests/);
});

test('nonce acak 128 bit', () => {
  const a = generateNonce();
  assert.equal(Buffer.from(a, 'base64').length, 16);
  assert.notEqual(a, generateNonce());
});

test('HSTS hanya bila APP_URL https', () => {
  assert.ok(dynamicSecurityHeaders({ appUrl: 'https://surat.contoh.go.id', csp: 'x' })['Strict-Transport-Security']);
  assert.equal(dynamicSecurityHeaders({ appUrl: 'http://localhost:3000', csp: 'x' })['Strict-Transport-Security'], undefined);
  assert.equal(dynamicSecurityHeaders({ appUrl: '', csp: 'x' })['Strict-Transport-Security'], undefined);
});

test('header statis memuat perlindungan dasar dan kamera hanya untuk situs sendiri', () => {
  const map = Object.fromEntries(STATIC_SECURITY_HEADERS.map((x) => [x.key, x.value]));
  assert.equal(map['X-Frame-Options'], 'DENY');
  assert.equal(map['X-Content-Type-Options'], 'nosniff');
  assert.match(map['Permissions-Policy'], /camera=\(self\)/);
});
