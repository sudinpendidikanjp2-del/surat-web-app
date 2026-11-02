import next from 'eslint-config-next/core-web-vitals';
import ts from 'eslint-config-next/typescript';

const config = [
  ...next,
  ...ts,
  {
    rules: {
      // Gambar di aplikasi ini berupa data URL (kode QR) dan pratinjau blob dari kamera; next/image tidak menambah apa pun.
      '@next/next/no-img-element': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  { ignores: ['.next/**', 'node_modules/**', 'storage/**', 'next-env.d.ts'] },
];

export default config;
