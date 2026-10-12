'use client';
import Link from 'next/link';
import { ArchiveIcon, BarChart3Icon, BellIcon, Building2Icon, FileTextIcon, KeyRoundIcon, ScrollTextIcon, SettingsIcon, UsersIcon, type LucideIcon } from 'lucide-react';
import { Page, PageHeader, Section } from '@/components/app/page';
import { useUser } from '@/components/app/user-context';
import { can, type PublicUser } from '@/domain/roles';

interface Tile { href: string; label: string; desc: string; icon: LucideIcon; show: (u: PublicUser) => boolean }

const DAILY: Tile[] = [
  { href: '/pemberitahuan', label: 'Pemberitahuan', desc: 'Kabar terbaru tentang surat dan pekerjaan Anda.', icon: BellIcon, show: () => true },
  { href: '/arsip', label: 'Arsip', desc: 'Surat yang sudah selesai, dikelompokkan per bulan.', icon: ArchiveIcon, show: () => true },
  { href: '/laporan', label: 'Laporan', desc: 'Jumlah surat dan daftar yang bisa diunduh untuk dicetak.', icon: BarChart3Icon, show: can.report },
  { href: '/akun', label: 'Akun Saya', desc: 'Lihat data diri dan ganti kata sandi.', icon: KeyRoundIcon, show: () => true },
];

const ADMIN: Tile[] = [
  { href: '/template', label: 'Contoh Surat (Template)', desc: 'Bentuk surat keluar yang tinggal diisi.', icon: FileTextIcon, show: can.admin },
  { href: '/pengguna', label: 'Pengguna', desc: 'Tambah pegawai, ubah peran, atau atur ulang kata sandi.', icon: UsersIcon, show: can.admin },
  { href: '/unit', label: 'Unit Kerja', desc: 'Bagian atau bidang di kantor.', icon: Building2Icon, show: can.admin },
  { href: '/pengaturan', label: 'Pengaturan Kantor', desc: 'Nama kantor, pola nomor surat, dan batas waktu.', icon: SettingsIcon, show: can.admin },
  { href: '/catatan', label: 'Catatan Kegiatan', desc: 'Siapa melakukan apa dan kapan.', icon: ScrollTextIcon, show: can.audit },
];

function Tiles({ items }: { items: Tile[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {items.map(({ href, label, desc, icon: Icon }) => (
        <li key={href}>
          <Link href={href} className="flex h-full min-h-[96px] items-start gap-4 rounded-md border-2 border-border bg-card p-5 text-foreground no-underline hover:border-primary hover:bg-primary-soft">
            <Icon className="mt-0.5 size-8 shrink-0 text-primary" aria-hidden />
            <span className="flex flex-col gap-1">
              <span className="text-xl font-bold underline underline-offset-4">{label}</span>
              <span className="text-muted-foreground">{desc}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Pekerjaan yang jarang dilakukan dikumpulkan di sini, dengan kalimat penjelasan pada setiap pilihan. */
export function MorePage() {
  const user = useUser();
  const admin = ADMIN.filter((t) => t.show(user));
  return (
    <Page>
      <PageHeader title="Menu Lainnya" intro="Pilihan yang tidak dipakai setiap hari. Pilih salah satu untuk membukanya." />
      <Tiles items={DAILY.filter((t) => t.show(user))} />
      {admin.length > 0 && (
        <Section title="Pengelolaan" intro="Khusus untuk pengelola aplikasi.">
          <Tiles items={admin} />
        </Section>
      )}
    </Page>
  );
}
