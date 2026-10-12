import next from 'eslint-config-next/core-web-vitals';
import ts from 'eslint-config-next/typescript';

export default [
  ...next,
  ...ts,
  { ignores: ['.next/**', 'node_modules/**', 'storage/**', 'next-env.d.ts', 'scripts/ocr/**'] },
];
