import type { Metadata, Viewport } from 'next';
import { jakarta } from './fonts';
import { Providers } from './providers';
import { themeBootScript } from '@/components/app/theme';
import { getBranding } from '@/server/branding';
import './globals.css';

/** Judul tab, deskripsi, dan ikon diambil dari Pengaturan > Tampilan sehingga admin dapat mengubahnya. */
export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  return {
    title: { default: b.judul_tab, template: `%s | ${b.judul_tab}` },
    description: b.deskripsi,
    applicationName: b.nama,
    ...(b.ikonUrl ? { icons: { icon: b.ikonUrl, apple: b.ikonUrl } } : {}),
  };
}

export const dynamic = 'force-dynamic';

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#ffffff' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const branding = await getBranding();
  return (
    <html lang="id" className={jakarta.variable} data-theme="light" suppressHydrationWarning>
      <head>
        {/* Tema dipasang sebelum halaman tampil, agar tidak berkedip. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <a href="#isi" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">Lewati ke isi halaman</a>
        <Providers branding={branding}>{children}</Providers>
      </body>
    </html>
  );
}
