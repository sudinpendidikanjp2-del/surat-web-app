import { test } from 'vitest';
import assert from 'node:assert/strict';
import { parseConfig } from '@/server/env';

test('nilai bawaan pengembangan tanpa masalah', () => {
  const { config, problems } = parseConfig({}, '/app');
  assert.deepEqual(problems, []);
  assert.equal(config.databaseUrl, 'postgres://surat:surat_dev@localhost:5432/surat');
  assert.equal(config.storageDir, '/app/storage/private');
  assert.equal(config.trustProxy, false);
  assert.equal(config.jobsEnabled, true);
  assert.equal(config.ocr.fallback, true);
});

test('produksi mewajibkan DATABASE_URL dan memperingatkan APP_URL kosong', () => {
  const { problems, warnings } = parseConfig({ NODE_ENV: 'production' });
  assert.ok(problems.some((p) => p.startsWith('DATABASE_URL wajib')));
  assert.ok(warnings.some((w) => w.startsWith('APP_URL')));
});

test('nilai salah ditolak tanpa menampilkan isinya', () => {
  const secret = 'postgres-rahasia-sekali';
  const { problems, config } = parseConfig({
    DATABASE_URL: `mysql://u:${secret}@db/x`, MAX_UPLOAD_MB: 'lima', SESSION_HOURS: '-1', APP_TZ: 'Bulan/Mars',
    OCR_ENGINE: 'tebak', OCR_EXTRA_JSON: '[1]', TRUST_PROXY: 'ya', APP_URL: 'surat.contoh.go.id', SEED_PASSWORD: 'pendek',
  });
  assert.equal(problems.length, 9);
  assert.ok(!problems.join('\n').includes(secret));
  assert.equal(config.maxUploadBytes, 15 * 1024 * 1024, 'nilai bawaan dipakai bila salah');
});

test('APP_URL dirapikan dan TRUST_PROXY dibaca tegas', () => {
  const { config, problems } = parseConfig({ APP_URL: 'https://surat.contoh.go.id/', TRUST_PROXY: 'true', OCR_FALLBACK: 'off', JOBS: 'off' });
  assert.deepEqual(problems, []);
  assert.equal(config.appUrl, 'https://surat.contoh.go.id');
  assert.equal(config.trustProxy, true);
  assert.equal(config.ocr.fallback, false);
  assert.equal(config.jobsEnabled, false);
});

test('mesin OCR yang membutuhkan alamat atau kunci', () => {
  assert.ok(parseConfig({ OCR_ENGINE: 'gemini' }).problems[0].includes('GEMINI_API_KEY'));
  assert.ok(parseConfig({ OCR_ENGINE: 'remote' }).problems[0].includes('OCR_URL'));
  assert.deepEqual(parseConfig({ OCR_ENGINE: 'gemini', GEMINI_API_KEY: 'k' }).problems, []);
});
