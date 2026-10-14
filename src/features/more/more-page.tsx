'use client';
import Link from 'next/link';
import { BellIcon, ChevronRightIcon, KeyRoundIcon } from 'lucide-react';
import { Page, PageHeader } from '@/components/app/page';
import { navGroups, type NavItem } from '@/components/app/navigation';
import { useUser } from '@/components/app/user-context';

function List({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h2 className="px-1 text-sm font-semibold text-muted-foreground">{title}</h2>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-border bg-card shadow-(--shadow-card)">
        {items.map(({ href, label, desc, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex min-h-14 items-center gap-3 px-4 py-2.5 text-foreground no-underline hover:bg-muted">
              <Icon className="size-5 shrink-0 text-primary" aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{label}</span>
                <span className="truncate text-sm text-muted-foreground">{desc}</span>
              </span>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Di ponsel, tujuan di luar bilah bawah ada di sini. Di layar lebar semuanya juga ada di menu samping. */
export function MorePage() {
  const user = useUser();
  const groups = navGroups(user, {});
  const daily = groups[0].items.filter((i) => !['/', '/surat-masuk'].includes(i.href));
  return (
    <Page className="max-w-2xl">
      <PageHeader title="Menu lainnya" />
      <List title="Surat" items={daily} />
      {groups.slice(1).map((g) => <List key={g.label} title={g.label!} items={g.items} />)}
      <List title="Akun" items={[
        { href: '/pemberitahuan', label: 'Pemberitahuan', icon: BellIcon, desc: 'Kabar terbaru untuk Anda' },
        { href: '/akun', label: 'Akun dan kata sandi', icon: KeyRoundIcon, desc: 'Data diri dan ganti kata sandi' },
      ]} />
    </Page>
  );
}
