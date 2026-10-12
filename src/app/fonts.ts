import localFont from 'next/font/local';

/**
 * Atkinson Hyperlegible Next: dirancang Braille Institute untuk pembaca berpenglihatan rendah. Huruf yang mirip
 * (I, l, 1, O, 0) dibedakan jelas, sangat berguna untuk nomor surat dan nomor agenda. Disimpan lokal: tanpa unduhan saat build.
 */
export const atkinson = localFont({
  src: '../../node_modules/@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2',
  variable: '--font-atkinson',
  weight: '200 800',
  display: 'swap',
});
