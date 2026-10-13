'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { BellIcon, ChevronDownIcon, KeyRoundIcon, LogOutIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useDashboard } from '@/features/home/api';
import { useNotifications } from '@/features/notifications/api';
import { isActive, mobileNav, navGroups } from './navigation';
import { ThemeMenu } from './theme';
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

const short = (n: number) => (n > 99 ? '99+' : String(n));

function UserMenu() {
  const user = useUser();
  const router = useRouter();
  const qc = useQueryClient();
  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    qc.clear();
    router.replace('/masuk');
    router.refresh();
  };
  const initials = user.nama.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2" aria-label={`Akun: ${user.nama}`}>
          {/* Inisial, bukan foto: aplikasi tidak menyimpan foto pegawai. */}
          <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-ink">{initials}</span>
          <span className="hidden max-w-40 truncate text-sm md:inline">{user.nama}</span>
          <ChevronDownIcon className="hidden size-4 text-muted-foreground md:block" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <DropdownMenuLabel className="flex flex-col">
          <span className="font-semibold text-foreground">{user.nama}</span>
          <span>{user.roleLabel}{user.unitNama && user.unitNama !== user.roleLabel ? `, ${user.unitNama}` : ''}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push('/akun')}><KeyRoundIcon aria-hidden /> Akun dan kata sandi</DropdownMenuItem>
        <DropdownMenuItem onSelect={logout}><LogOutIcon aria-hidden /> Keluar</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Kerangka: kepala halaman tipis (pemberitahuan, tampilan, akun), menu samping berkelompok di layar lebar,
 * bilah empat tujuan di bawah layar ponsel.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useUser();
  const pathname = usePathname();
  const counts = useCounts();
  const groups = navGroups(user, counts);
  const mobile = mobileNav(user, counts);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="no-print sticky top-0 z-40 border-b border-border bg-card pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center justify-between gap-2 px-4 lg:px-5">
          <Link href="/" className="flex items-baseline gap-2 text-foreground no-underline">
            <span className="text-base font-bold">Sistem Surat</span>
            <span className="hidden text-sm text-muted-foreground sm:inline">Disposisi dan tindak lanjut</span>
          </Link>
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="icon" className="relative">
              <Link href="/pemberitahuan" aria-label={counts.notif ? `Pemberitahuan, ${counts.notif} belum dibaca` : 'Pemberitahuan'}>
                <BellIcon className="size-[18px]" aria-hidden />
                {counts.notif ? <span aria-hidden className="absolute right-1 top-1 min-w-4 rounded-full bg-destructive px-1 text-center text-[11px] font-bold leading-4 text-destructive-foreground">{short(counts.notif)}</span> : null}
              </Link>
            </Button>
            <ThemeMenu />
            <UserMenu />
          </div>
        </div>
      </header>
      <div className="flex flex-1">
        <div className="no-print hidden w-60 shrink-0 border-r border-border bg-card lg:block">
        <nav aria-label="Menu utama" className="sticky top-14 flex h-[calc(100dvh-3.5rem)] flex-col gap-5 overflow-y-auto px-3 py-4">
          {groups.map((g, i) => (
            <div key={g.label || i} className="flex flex-col gap-0.5">
              {g.label && <p className="px-3 pb-1 text-sm font-semibold text-muted-foreground">{g.label}</p>}
              {g.items.map((it) => {
                const on = isActive(pathname, it.href);
                return (
                  <Link key={it.href} href={it.href} aria-current={on ? 'page' : undefined}
                    className={cn('flex h-9 items-center gap-2.5 rounded-md px-3 text-sm font-medium no-underline transition-colors duration-150',
                      on ? 'bg-primary-soft font-semibold text-primary-ink' : 'text-foreground hover:bg-muted')}>
                    <it.icon className={cn('size-4 shrink-0', on ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
                    <span className="truncate">{it.label}</span>
                    {it.count ? <span className="ml-auto rounded-sm bg-destructive px-1.5 text-xs font-bold leading-5 text-destructive-foreground" aria-label={`${it.count} perlu perhatian`}>{short(it.count)}</span> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        </div>
        <main id="isi" tabIndex={-1} className="min-w-0 flex-1 pb-24 outline-none lg:pb-10">{children}</main>
      </div>
      <nav aria-label="Menu utama" className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
        {mobile.map((it) => {
          const on = isActive(pathname, it.href);
          return (
            <Link key={it.href} href={it.href} aria-current={on ? 'page' : undefined}
              className={cn('relative flex h-16 flex-col items-center justify-center gap-1 px-1 text-center text-xs font-semibold leading-tight no-underline',
                on ? 'text-primary' : 'text-muted-foreground')}>
              <it.icon className="size-5" aria-hidden />
              <span>{it.label}</span>
              {it.count ? <span className="absolute left-1/2 top-1.5 ml-2 rounded-full bg-destructive px-1.5 text-[11px] font-bold leading-4 text-destructive-foreground" aria-label={`${it.count} baru`}>{short(it.count)}</span> : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
