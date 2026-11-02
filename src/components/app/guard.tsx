'use client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { PublicUser } from '@/domain/roles';
import { Page } from './page';
import { Empty } from './states';
import { useUser } from './user-context';

/** Halaman yang hanya untuk peran tertentu. Server tetap memeriksa hak akses pada setiap permintaan data. */
export function Guard({ allow, children }: { allow: (u: PublicUser) => boolean; children: React.ReactNode }) {
  const user = useUser();
  if (allow(user)) return <>{children}</>;
  return (
    <Page>
      <Empty title="Halaman ini bukan untuk peran Anda" text={`Anda masuk sebagai ${user.roleLabel}. Bila Anda perlu membuka halaman ini, hubungi admin sistem.`}
        action={<Button asChild className="no-underline"><Link href="/">Kembali ke Beranda</Link></Button>} />
    </Page>
  );
}
