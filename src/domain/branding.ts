/** Identitas aplikasi yang dapat diubah admin: nama, keterangan, judul tab, deskripsi untuk mesin pencari, dan ikon. */
export interface Branding {
  nama: string;
  tagline: string;
  judul_tab: string;
  deskripsi: string;
  /** Path file ikon di penyimpanan privat, atau null bila memakai ikon bawaan peramban. */
  ikon: string | null;
  /** Penanda versi ikon agar peramban memuat ulang setelah diganti. */
  ikon_versi?: number;
}

export const DEFAULT_BRANDING: Branding = {
  nama: 'Sistem Surat',
  tagline: 'Disposisi dan tindak lanjut',
  judul_tab: 'Sistem Surat',
  deskripsi: 'Sistem manajemen surat masuk, disposisi, tindak lanjut, dan surat keluar untuk instansi.',
  ikon: null,
};

export const withBrandingDefaults = (v: Partial<Branding> | null | undefined): Branding => ({ ...DEFAULT_BRANDING, ...(v || {}) });

/** Bentuk yang aman dikirim ke peramban (tanpa path file). */
export interface PublicBranding { nama: string; tagline: string; judul_tab: string; deskripsi: string; ikonUrl: string | null }
export const toPublicBranding = (b: Branding): PublicBranding => ({
  nama: b.nama, tagline: b.tagline, judul_tab: b.judul_tab, deskripsi: b.deskripsi,
  ikonUrl: b.ikon ? `/api/branding/ikon?v=${b.ikon_versi || 1}` : null,
});
