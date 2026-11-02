import { test } from 'vitest';
import assert from 'node:assert/strict';
import { baseUrl, clientIp, isHttps } from '@/server/http/client';

const h = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });
const url = new URL('http://10.0.0.5:3000/api/x');

test('tanpa proxy tepercaya, header IP diabaikan', () => {
  assert.equal(clientIp(h({ 'x-real-ip': '203.0.113.1', 'x-forwarded-for': '203.0.113.1' }), false), null);
});

test('proxy tepercaya: X-Real-IP, lalu entri X-Forwarded-For paling kanan', () => {
  assert.equal(clientIp(h({ 'x-real-ip': '203.0.113.1' }), true), '203.0.113.1');
  assert.equal(clientIp(h({ 'x-forwarded-for': '198.51.100.9, 203.0.113.2' }), true), '203.0.113.2');
  assert.equal(clientIp(h({ 'x-forwarded-for': '2001:db8::1' }), true), '2001:db8::1');
});

test('nilai yang bukan IP dibuang', () => {
  assert.equal(clientIp(h({ 'x-real-ip': '<script>' }), true), null);
  assert.equal(clientIp(h({ 'x-forwarded-for': '203.0.113.2, evil' }), true), null);
});

test('alamat dasar: APP_URL lebih dulu, header proxy hanya bila dipercaya', () => {
  const headers = h({ host: 'surat.local:3000', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'palsu.example' });
  assert.equal(baseUrl(headers, url, { appUrl: 'https://surat.contoh.go.id', trustProxy: false }), 'https://surat.contoh.go.id');
  assert.equal(baseUrl(headers, url, { appUrl: '', trustProxy: false }), 'http://surat.local:3000');
  assert.equal(baseUrl(headers, url, { appUrl: '', trustProxy: true }), 'https://palsu.example');
  assert.equal(isHttps(headers, url, { appUrl: '', trustProxy: false }), false);
  assert.equal(isHttps(headers, url, { appUrl: '', trustProxy: true }), true);
});
