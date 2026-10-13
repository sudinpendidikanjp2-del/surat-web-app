import type { Metadata, Viewport } from 'next';
import { atkinson } from './fonts';
import { Providers } from './providers';
import { themeBootScript } from '@/components/app/theme';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Sistem Surat', template: '%s | Sistem Surat' },
  description: 'Sistem manajemen surat, disposisi, dan tindak lanjut untuk instansi.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#ffffff' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={atkinson.variable} data-theme="light" suppressHydrationWarning>
      <head>
        {/* Tema dipasang sebelum halaman tampil, agar tidak berkedip. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <a href="#isi" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">Lewati ke isi halaman</a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
