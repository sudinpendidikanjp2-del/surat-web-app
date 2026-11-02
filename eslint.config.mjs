import { defineConfig, globalIgnores } from 'eslint/config';
import next from 'eslint-config-next/core-web-vitals';
import ts from 'eslint-config-next/typescript';

export default defineConfig([
  ...next,
  ...ts,
  {
    rules: {
      // Gambar di aplikasi ini berupa data URL (kode QR) dan pratinjau blob dari kamera; next/image tidak menambah apa pun.
      '@next/next/no-img-element': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      // Impor tipe ditandai `import type` agar tidak ikut terbundel dan batas server/klien terlihat jelas.
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      // console.log untuk debug tidak boleh tertinggal; info/warn/error dipakai log operasional.
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'jsx-a11y/alt-text': 'error',
    },
  },
  {
    // Lapisan domain dan aplikasi tidak boleh bergantung pada infrastruktur (aturan clean architecture repo ini).
    files: ['src/domain/**/*.ts', 'src/server/application/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/server/infrastructure/*', '@/server/infrastructure/**'], message: 'Use case memakai port (application/ports.ts); implementasinya dipasang di server/container.ts.' },
          { group: ['@/server/config', '@/server/container'], message: 'Konfigurasi dan composition root hanya dipakai lapisan HTTP dan infrastruktur.' },
          { group: ['pg', 'next/*', 'react'], message: 'Domain dan use case tidak bergantung pada database, Next.js, atau React.' },
        ],
      }],
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['@/server/*', '@/server/**', '@/features/**', '@/components/**'], message: 'Domain hanya berisi aturan murni.' }] }],
    },
  },
  {
    files: ['scripts/**/*.{mjs,ts}', 'test/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  globalIgnores(['.next/**', 'node_modules/**', 'storage/**', 'coverage/**', '.data/**', 'next-env.d.ts']),
]);
