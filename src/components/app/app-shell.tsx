'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { BellIcon, ChevronDownIcon, KeyRoundIcon, LogOutIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useDashboard } from '@/features/home/api';
import { useNotifications } from '@/features/notifications/api';
import { isActive, mobileNav, navGroups } from './navigation';
import { ThemeMenu } from './theme';
import { BrandMark } from './branding';
import { can } from '@/domain/roles';
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
        <Button variant="ghost" className="gap-2 pl-1 pr-2" aria-label={`Akun: ${user.nama}`}>
          {/* Inisial, bukan foto: aplikasi tidak menyimpan foto pegawai. */}
          <span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">{initials}</span>
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

/** Kotak cari global di bilah atas: Enter membuka halaman Cari Surat dengan kata itu. */
function GlobalSearch() {
  const router = useRouter();
  return (
    <form role="search" className="relative hidden w-full max-w-md md:block" onSubmit={(e) => {
      e.preventDefault();
      const q = String(new FormData(e.currentTarget).get('q') || '').trim();
      router.push(q ? `/cari?q=${encodeURIComponent(q)}` : '/cari');
    }}>
      <label htmlFor="cari-global" className="sr-only">Cari surat</label>
      <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input id="cari-global" name="q" type="search" placeholder="Cari nomor, perihal, atau pengirim…"
        className="h-10 w-full rounded-full border border-border bg-card pl-10 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15" />
    </form>
  );
}

/** Tindakan cepat di bawah menu samping (navy, agar kuning tetap satu per layar), sesuai peran: TU mencatat, penulis membuat surat keluar. */
function SideAction() {
  const user = useUser();
  if (can.manageIn(user)) return <Button asChild variant="dark" className="w-full"><Link href="/surat-masuk/baru"><PlusIcon aria-hidden /> Catat Surat Masuk</Link></Button>;
  if (can.writeOut(user)) return <Button asChild variant="dark" className="w-full"><Link href="/surat-keluar/baru"><PlusIcon aria-hidden /> Buat Surat Keluar</Link></Button>;
  return null;
}

/**
 * Kerangka: menu samping putih dengan item aktif berbentuk kapsul navy (layar lebar), bilah atas berisi cari,
 * pemberitahuan, tampilan, dan akun; bilah empat tujuan di bawah layar ponsel.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useUser();
  const pathname = usePathname();
  const counts = useCounts();
  const groups = navGroups(user, counts);
  const mobile = mobileNav(user, counts);
  return (
    <div className="flex min-h-dvh">
      <aside className="no-print hidden w-64 shrink-0 border-r border-border bg-card lg:block">
        <div className="sticky top-0 flex h-dvh flex-col">
          <Link href="/" className="flex h-16 items-center px-6 no-underline"><BrandMark /></Link>
          <nav aria-label="Menu utama" className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-3">
            {groups.map((g, i) => (
              <div key={g.label || i} className="flex flex-col gap-1">
                {g.label && <p className="px-4 pb-1 text-xs font-semibold text-muted-foreground">{g.label}</p>}
                {g.items.map((it) => {
                  const on = isActive(pathname, it.href);
                  return (
                    <Link key={it.href} href={it.href} aria-current={on ? 'page' : undefined}
                      className={cn('flex h-10 items-center gap-3 rounded-full px-4 text-sm font-medium no-underline transition-colors duration-150',
                        on ? 'bg-primary font-semibold text-primary-foreground' : 'text-foreground hover:bg-muted')}>
                      <it.icon className={cn('size-[18px] shrink-0', on ? '' : 'text-muted-foreground')} aria-hidden />
                      <span className="truncate">{it.label}</span>
                      {it.count ? <span className={cn('ml-auto min-w-5 rounded-full px-1.5 text-center text-xs font-bold leading-5', on ? 'bg-accent text-accent-foreground' : 'bg-accent text-accent-foreground')} aria-label={`${it.count} perlu perhatian`}>{short(it.count)}</span> : null}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          {(can.manageIn(user) || can.writeOut(user)) && <div className="flex flex-col gap-3 border-t border-line p-4"><SideAction /></div>}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-40 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex h-16 items-center justify-between gap-3 px-4 lg:px-8">
            <Link href="/" className="no-underline lg:hidden"><BrandMark /></Link>
            <GlobalSearch />
            <div className="flex items-center gap-1">
              <Button asChild variant="ghost" size="icon" className="relative md:hidden"><Link href="/cari" aria-label="Cari surat"><SearchIcon className="size-[18px]" aria-hidden /></Link></Button>
              <Button asChild variant="ghost" size="icon" className="relative">
                <Link href="/pemberitahuan" aria-label={counts.notif ? `Pemberitahuan, ${counts.notif} belum dibaca` : 'Pemberitahuan'}>
                  <BellIcon className="size-[18px]" aria-hidden />
                  {counts.notif ? <span aria-hidden className="absolute right-1.5 top-1.5 min-w-4 rounded-full bg-destructive px-1 text-center text-[11px] font-bold leading-4 text-destructive-foreground">{short(counts.notif)}</span> : null}
                </Link>
              </Button>
              <ThemeMenu />
              <UserMenu />
            </div>
          </div>
        </header>
        <main id="isi" tabIndex={-1} className="min-w-0 flex-1 pb-24 outline-none lg:pb-10">{children}</main>
      </div>
      <nav aria-label="Menu utama" className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
        {mobile.map((it) => {
          const on = isActive(pathname, it.href);
          return (
            <Link key={it.href} href={it.href} aria-current={on ? 'page' : undefined}
              className={cn('relative flex h-16 flex-col items-center justify-center gap-1 px-1 text-center text-xs font-semibold leading-tight no-underline',
                on ? 'text-foreground' : 'text-muted-foreground')}>
              <span className={cn('flex h-7 w-12 items-center justify-center rounded-full', on && 'bg-primary text-primary-foreground')}><it.icon className="size-[18px]" aria-hidden /></span>
              <span>{it.label}</span>
              {it.count ? <span className="absolute left-1/2 top-1 ml-3 rounded-full bg-accent px-1.5 text-[11px] font-bold leading-4 text-accent-foreground" aria-label={`${it.count} baru`}>{short(it.count)}</span> : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
