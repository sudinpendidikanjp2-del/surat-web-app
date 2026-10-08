import { createContext, useContext } from 'react';

export const AuthCtx = createContext(null);
export const useUser = () => useContext(AuthCtx);

export const ROLES_WRITE_OUT = ['superadmin', 'tu', 'pejabat', 'pelaksana'];
export const can = {
  kelolaIn: (u) => ['superadmin', 'tu'].includes(u.role),
  tulisKeluar: (u) => ROLES_WRITE_OUT.includes(u.role),
  admin: (u) => u.role === 'superadmin',
  laporan: (u) => u.role !== 'pelaksana',
  audit: (u) => ['superadmin', 'pimpinan'].includes(u.role),
  pekerjaan: (u) => u.role !== 'viewer',
};
