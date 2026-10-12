'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Page } from '@/components/app/page';
import { Empty, Loading } from '@/components/app/states';
import { api } from '@/lib/api-client';

export function QrRedirect({ token }: { token: string }) {
  const router = useRouter();
  const q = useQuery({ queryKey: ['qr', token], queryFn: () => api.get<{ id: number }>(`/qr/${encodeURIComponent(token)}`), retry: false });
  useEffect(() => { if (q.data) router.replace(`/surat-masuk/${q.data.id}`); }, [q.data, router]);
  return (
    <Page>
      {q.isError ? (
        <Empty title="Surat tidak dapat dibuka" text={q.error.message}
          action={<Button asChild className="no-underline"><Link href="/surat-masuk">Buka Daftar Surat Masuk</Link></Button>} />
      ) : <Loading label="Sedang membuka surat…" rows={1} />}
    </Page>
  );
}
