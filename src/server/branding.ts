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
