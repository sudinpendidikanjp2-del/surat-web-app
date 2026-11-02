import path from 'node:path';
import { defineConfig } from 'vitest/config';

const alias = {
  '@': path.resolve(__dirname, 'src'),
  'server-only': path.resolve(__dirname, 'test/stubs/server-only.ts'),
};

/**
 * Dua proyek seperti sudindikjp2:
 *   unit         fungsi murni, tanpa database dan tanpa server (npm test, beberapa detik)
 *   integration  melawan server Next.js hasil `npm run build` dan PostgreSQL sungguhan (npm run test:integration)
 * Tolok ukur OCR lambat, jadi hanya lewat `npm run bench:ocr`.
 */
export default defineConfig({
  resolve: { alias },
  test: process.env.OCR_BENCH
    ? { environment: 'node', include: ['scripts/ocr/*.test.ts'], testTimeout: 600_000 }
    : {
        // Berkas integrasi masing-masing menyalakan server dan database sendiri: jalankan berurutan.
        fileParallelism: false,
        projects: [
          { resolve: { alias }, test: { name: 'unit', environment: 'node', include: ['test/unit/**/*.test.ts'] } },
          {
            resolve: { alias },
            test: {
              name: 'integration',
              environment: 'node',
              include: ['test/integration/**/*.test.ts'],
              testTimeout: 120_000,
              hookTimeout: 180_000,
            },
          },
        ],
      },
});
