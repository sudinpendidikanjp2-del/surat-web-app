'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/app/theme';
import { BrandingProvider } from '@/components/app/branding';
import type { PublicBranding } from '@/domain/branding';
import { setUnauthorizedHandler } from '@/lib/api-client';

export function Providers({ children, branding }: { children: React.ReactNode; branding: PublicBranding }) {
  const router = useRouter();
  const [client] = useState(() => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 15_000, refetchOnWindowFocus: true } } });
    // Sesi habis di tengah pekerjaan: kembali ke halaman masuk, lalu lanjut ke halaman yang sama.
    setUnauthorizedHandler(() => {
      qc.clear();
      router.replace(`/masuk?lanjut=${encodeURIComponent(location.pathname + location.search)}`);
    });
    return qc;
  });
  return (
    <BrandingProvider value={branding}>
    <ThemeProvider>
      <QueryClientProvider client={client}>
        {children}
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
    </BrandingProvider>
  );
}
