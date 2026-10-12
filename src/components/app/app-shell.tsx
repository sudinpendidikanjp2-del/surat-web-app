'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { BellIcon, LogOutIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useDashboard } from '@/features/home/api';
import { useNotifications } from '@/features/notifications/api';
import { isActive, mainNav } from './navigation';
import { useUser } from './user-context';

function useCounts() {
  const user = useUser();
  const d = useDashboard().data;
  const n = useNotifications().data;
  const leader = ['pimpinan', 'superadmin'].includes(user.role);
  return {
    masuk: leader ? d?.counts?.menunggu_disposisi : user.role === 'tu' ? d?.counts?.belum_diteruskan : 0,
    kerja: (d?.disposisi_baru?.length || 0) + (d?.tugas_saya?.terlambat || 0) + (d?.tugas_saya?.hari_ini || 0),
    keluar: leader ? d?.keluar?.menunggu_persetujuan : 0,
    notif: n?.unread || 0,
  };
}

const Count = ({ n, label }: { n?: number; label: string }) =>
  n ? <span className="ml-auto rounded-sm bg-destructive px-2 py-0.5 text-base font-bold text-destructive-foreground" aria-label={`${n} ${label}`}>{n > 99 ? '99+' : n}</span> : null;

/**
 * Kerangka: kepala halaman dengan nama aplikasi dan tombol Keluar; menu samping berlabel di layar lebar;
 * bilah menu bawah berlabel di ponsel (pola yang sudah dikenal dari aplikasi pesan). Tidak ada menu tersembunyi.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const counts = useCounts();
  const nav = mainNav(user, counts);
  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    qc.clear();
    router.replace('/masuk');
    router.refresh();
  };
  // Bilah bawah ponsel: empat tujuan yang paling sering. Pemberitahuan ada di kepala halaman.
  const third = nav.some((n) => n.href === '/pekerjaan') ? '/pekerjaan' : '/surat-keluar';
  const mobile = ['/', '/surat-masuk', third, '/lainnya'].map((h) => nav.find((n) => n.href === h)!);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="no-print border-b-2 border-[#d6d1c4] bg-card">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3 pt-[max(12px,env(safe-area-inset-top))] sm:px-6">
          <Link href="/" className="flex flex-col no-underline">
            <span className="text-xl font-bold text-foreground">Sistem Surat</span>
            <span className="text-base text-muted-foreground">Disposisi dan tindak lanjut</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="font-bold">{user.nama}</div>
              <div className="text-muted-foreground">{user.roleLabel}{user.unitNama && user.unitNama !== user.roleLabel ? `, ${user.unitNama}` : ''}</div>
            </div>
            <Button asChild variant="outline">
              <Link href="/pemberitahuan" className="no-underline" aria-label={counts.notif ? `Pemberitahuan, ${counts.notif} belum dibaca` : 'Pemberitahuan'}>
                <BellIcon aria-hidden /> Pemberitahuan{counts.notif ? <span className="rounded-sm bg-destructive px-2 text-destructive-foreground" aria-hidden>{counts.notif > 99 ? '99+' : counts.notif}</span> : null}
              </Link>
            </Button>
            <Button variant="outline" onClick={logout}><LogOutIcon aria-hidden /> Keluar</Button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[1400px] flex-1">
        <nav aria-label="Menu utama" className="no-print sticky top-0 hidden h-dvh w-72 shrink-0 flex-col gap-2 overflow-y-auto border-r-2 border-[#d6d1c4] bg-card p-4 lg:flex">
          {nav.map((it) => {
            const on = isActive(pathname, it.href);
            return (
              <Link key={it.href} href={it.href} aria-current={on ? 'page' : undefined}
                className={cn('flex min-h-[56px] items-center gap-3 rounded-md border-2 px-4 text-lg font-bold no-underline transition-colors',
                  on ? 'border-primary bg-primary text-primary-foreground' : 'border-transparent text-foreground hover:border-[#d6d1c4] hover:bg-muted')}>
                <it.icon className="size-6 shrink-0" aria-hidden /> {it.label} <Count n={it.count} label="perlu perhatian" />
              </Link>
            );
          })}
        </nav>
        <main id="isi" tabIndex={-1} className="min-w-0 flex-1 pb-28 outline-none lg:pb-10">{children}</main>
      </div>
      <nav aria-label="Menu utama" className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t-2 border-[#d6d1c4] bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
        {mobile.map((it) => {
          const on = isActive(pathname, it.href);
          return (
            <Link key={it.href} href={it.href} aria-current={on ? 'page' : undefined}
              className={cn('relative flex min-h-[68px] flex-col items-center justify-center gap-0.5 px-1 text-center text-sm font-bold leading-tight no-underline',
                on ? 'bg-primary text-primary-foreground' : 'text-foreground')}>
              <it.icon className="size-6" aria-hidden />
              <span>{it.label}</span>
              {it.count ? <span className="absolute right-1.5 top-1 rounded-sm bg-destructive px-1.5 text-sm text-destructive-foreground" aria-label={`${it.count} baru`}>{it.count > 99 ? '99+' : it.count}</span> : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
