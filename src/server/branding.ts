import 'server-only';
import { cache } from 'react';
import { DEFAULT_BRANDING, toPublicBranding, withBrandingDefaults, type Branding } from '@/domain/branding';
import { deps } from './container';

/** Identitas aplikasi untuk satu permintaan halaman. Bila database belum siap, memakai nilai bawaan. */
export const getBranding = cache(async () => {
  try {
    return toPublicBranding(withBrandingDefaults(await deps().uow.read.settings.get<Branding>('tampilan')));
  } catch {
    return toPublicBranding(DEFAULT_BRANDING);
  }
});

/** Identitas kantor (Pengaturan > Identitas kantor) untuk halaman umum seperti kebijakan privasi. */
export const getOffice = cache(async () => {
  try {
    const v = (await deps().uow.read.settings.get<{ nama?: string; alamat?: string; kota?: string }>('instansi')) || {};
    return { nama: v.nama?.trim() || 'Kantor pengelola aplikasi', alamat: [v.alamat, v.kota].filter((x) => x?.trim()).join(', ') };
  } catch {
    return { nama: 'Kantor pengelola aplikasi', alamat: '' };
  }
});
