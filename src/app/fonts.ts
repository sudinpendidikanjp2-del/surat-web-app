import localFont from 'next/font/local';

/**
 * Plus Jakarta Sans: karya foundry Indonesia (Tokotype), geometris dan bersih seperti referensi desain,
 * angka tabelnya rapi untuk nomor agenda. Disimpan lokal: tanpa unduhan saat build maupun saat dibuka.
 */
export const jakarta = localFont({
  src: '../../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2',
  variable: '--font-jakarta',
  weight: '200 800',
  display: 'swap',
});
