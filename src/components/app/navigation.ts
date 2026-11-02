import { CloudUploadIcon, DatabaseBackupIcon, ArchiveIcon, BarChart3Icon, BookOpenIcon, BriefcaseIcon, Building2Icon, LandmarkIcon, FileOutputIcon, FileTextIcon, HomeIcon, InboxIcon, LayoutGridIcon, ScrollTextIcon, SearchIcon, SettingsIcon, UsersIcon, type LucideIcon } from 'lucide-react';
import { can } from '@/domain/roles';
import type { PublicUser } from '@/domain/roles';

export interface NavItem { href: string; label: string; icon: LucideIcon; count?: number; desc: string }
export interface NavGroup { label?: string; items: NavItem[] }
type Counts = { masuk?: number; kerja?: number; keluar?: number; notif?: number };

/**
 * Menu samping: pekerjaan harian di atas tanpa judul kelompok, lalu penelusuran, lalu pengelolaan.
 * Setiap butir menunjuk halaman yang ada; kelompok yang kosong untuk peran itu tidak ditampilkan.
 */
export function navGroups(user: PublicUser, counts: Counts): NavGroup[] {
  const groups: NavGroup[] = [
    {
      items: [
        { href: '/', label: 'Beranda', icon: HomeIcon, desc: 'Pekerjaan yang menunggu Anda' },
        { href: '/surat-masuk', label: 'Surat Masuk', icon: InboxIcon, count: counts.masuk, desc: 'Surat yang diterima kantor' },
        ...(can.work(user) ? [{ href: '/pekerjaan', label: 'Pekerjaan Saya', icon: BriefcaseIcon, count: counts.kerja, desc: 'Disposisi dan tugas untuk Anda' }] : []),
        { href: '/surat-keluar', label: 'Surat Keluar', icon: FileOutputIcon, count: counts.keluar, desc: 'Surat yang dibuat dan dikirim kantor' },
      ],
    },
    {
      label: 'Telusuri',
      items: [
        { href: '/cari', label: 'Cari Surat', icon: SearchIcon, desc: 'Nomor, perihal, atau pengirim' },
        { href: '/arsip', label: 'Arsip', icon: ArchiveIcon, desc: 'Surat selesai per bulan' },
        ...(can.report(user) ? [{ href: '/laporan', label: 'Laporan', icon: BarChart3Icon, desc: 'Rekap dan unduhan CSV' }] : []),
      ],
    },
    {
      label: 'Pengelolaan',
      items: [
        ...(can.manageIn(user) ? [{ href: '/instansi', label: 'Instansi', icon: LandmarkIcon, desc: 'Instansi pengirim dan tujuan surat' }] : []),
        ...(can.admin(user) ? [
          { href: '/referensi', label: 'Data Referensi', icon: BookOpenIcon, desc: 'Jenis surat, sifat, tindakan, cara kirim' },
          { href: '/template', label: 'Template Surat', icon: FileTextIcon, desc: 'Bentuk surat keluar dalam DOCX' },
          { href: '/pengguna', label: 'Pengguna', icon: UsersIcon, desc: 'Akun, peran, dan kata sandi' },
          { href: '/unit', label: 'Unit Kerja', icon: Building2Icon, desc: 'Bagian dan bidang di kantor' },
          { href: '/pengaturan', label: 'Pengaturan', icon: SettingsIcon, desc: 'Identitas kantor, nomor surat, batas waktu' },
          { href: '/google', label: 'Google Drive & Sheets', icon: CloudUploadIcon, desc: 'Salinan lampiran dan rekap ke Google' },
          { href: '/cadangan', label: 'Cadangan Data', icon: DatabaseBackupIcon, desc: 'Cadangkan dan pulihkan seluruh data' },
        ] : []),
        ...(can.audit(user) ? [{ href: '/catatan', label: 'Catatan Kegiatan', icon: ScrollTextIcon, desc: 'Siapa melakukan apa dan kapan' }] : []),
      ],
    },
  ];
  return groups.filter((g) => g.items.length > 0);
}

/** Bilah bawah ponsel: tiga tujuan harian dan "Lainnya" yang memuat sisanya. */
export function mobileNav(user: PublicUser, counts: Counts): NavItem[] {
  const daily = navGroups(user, counts)[0].items;
  const third = daily.find((i) => i.href === '/pekerjaan') || daily.find((i) => i.href === '/surat-keluar')!;
  return [daily[0], daily[1], third, { href: '/lainnya', label: 'Lainnya', icon: LayoutGridIcon, desc: 'Menu lainnya' }];
}

export const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));
