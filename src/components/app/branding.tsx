'use client';
import { createContext, useContext } from 'react';
import { DEFAULT_BRANDING, toPublicBranding, type PublicBranding } from '@/domain/branding';

const Ctx = createContext<PublicBranding>(toPublicBranding(DEFAULT_BRANDING));
export const BrandingProvider = Ctx.Provider;
export const useBranding = () => useContext(Ctx);

/**
 * Nama aplikasi di menu samping dan halaman masuk. Ikon hanya tampil bila admin sudah mengunggahnya:
 * tanpa itu, nama ditulis sebagai teks (tidak ada logo rekaan).
 */
export function BrandMark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const b = useBranding();
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {b.ikonUrl && <img src={b.ikonUrl} alt="" className={size === 'lg' ? 'size-10 rounded-xl' : 'size-8 rounded-lg'} />}
      <span className="flex min-w-0 flex-col leading-tight">
        <span className={`truncate font-extrabold tracking-tight text-foreground ${size === 'lg' ? 'text-2xl' : 'text-lg'}`}>{b.nama}</span>
        {b.tagline && <span className="truncate text-xs text-muted-foreground">{b.tagline}</span>}
      </span>
    </span>
  );
}
