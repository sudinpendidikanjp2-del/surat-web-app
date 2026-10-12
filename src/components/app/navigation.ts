import { BriefcaseIcon, FileOutputIcon, HomeIcon, InboxIcon, LayoutGridIcon, SearchIcon, type LucideIcon } from 'lucide-react';
import { can } from '@/domain/roles';
import type { PublicUser } from '@/domain/roles';

export interface NavItem { href: string; label: string; icon: LucideIcon; count?: number; desc: string }

/**
 * Menu utama sengaja pendek (enam butir). Pekerjaan yang jarang (arsip, laporan, admin)
 * dikumpulkan di "Menu Lainnya" agar layar utama tidak penuh pilihan.
 */
export function mainNav(user: PublicUser, counts: { masuk?: number; kerja?: number; keluar?: number; notif?: number }): NavItem[] {
  return [
    { href: '/', label: 'Beranda', icon: HomeIcon, desc: 'Pekerjaan yang menunggu Anda hari ini' },
    { href: '/surat-masuk', label: 'Surat Masuk', icon: InboxIcon, count: counts.masuk, desc: 'Surat yang diterima kantor' },
    ...(can.work(user) ? [{ href: '/pekerjaan', label: 'Pekerjaan Saya', icon: BriefcaseIcon, count: counts.kerja, desc: 'Disposisi dan tugas untuk Anda' }] : []),
    { href: '/surat-keluar', label: 'Surat Keluar', icon: FileOutputIcon, count: counts.keluar, desc: 'Surat yang dibuat dan dikirim kantor' },
    { href: '/cari', label: 'Cari Surat', icon: SearchIcon, desc: 'Temukan surat dari nomor atau perihal' },
    { href: '/lainnya', label: 'Menu Lainnya', icon: LayoutGridIcon, desc: 'Arsip, laporan, dan pengaturan' },
  ];
}

export const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));
