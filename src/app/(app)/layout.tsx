import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { toPublicUser } from '@/domain/roles';
import { resolveSession } from '@/server/application/auth';
import { deps } from '@/server/container';
import { SESSION_COOKIE } from '@/server/http/handler';
import { AppShell } from '@/components/app/app-shell';
import { UserProvider } from '@/components/app/user-context';

/** Semua halaman kerja melewati pemeriksaan sesi di server. Tanpa sesi: ke halaman masuk. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const actor = await resolveSession(deps(), token);
  if (!actor) {
    const path = (await headers()).get('x-surat-path');
    redirect(path && path !== '/' ? `/masuk?lanjut=${encodeURIComponent(path)}` : '/masuk');
  }
  return (
    <UserProvider value={toPublicUser(actor)}>
      <AppShell>{children}</AppShell>
    </UserProvider>
  );
}
