import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'server-only': path.resolve(__dirname, 'test/support/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    // Tolok ukur OCR lambat, jadi hanya dijalankan lewat `npm run bench:ocr`.
    include: process.env.OCR_BENCH ? ['scripts/ocr/*.test.ts'] : ['test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 180_000,
    sequence: { concurrent: false },
  },
});
