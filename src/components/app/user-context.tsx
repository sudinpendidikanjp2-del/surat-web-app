'use client';
import { createContext, useContext } from 'react';
import type { PublicUser } from '@/domain/roles';

const UserCtx = createContext<PublicUser | null>(null);
export const UserProvider = UserCtx.Provider;

/** Pengguna yang sedang masuk. Hanya dipakai di dalam (app), yang selalu sudah melewati pemeriksaan sesi. */
export function useUser(): PublicUser {
  const u = useContext(UserCtx);
  if (!u) throw new Error('useUser dipakai di luar halaman yang memerlukan login');
  return u;
}
