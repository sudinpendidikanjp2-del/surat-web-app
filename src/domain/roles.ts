/** Peran dan kebijakan akses. Murni: tidak tahu database maupun HTTP. */

export const ROLES = ['superadmin', 'tu', 'pimpinan', 'pejabat', 'pelaksana', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: 'Admin Sistem',
  tu: 'Tata Usaha',
  pimpinan: 'Pimpinan',
  pejabat: 'Pejabat / Koordinator',
  pelaksana: 'Pelaksana',
  viewer: 'Pemantau',
};

/** Pengguna yang sedang bertindak. */
export interface Actor {
  id: number;
  username: string;
  nama: string;
  role: Role;
  unit_id: number | null;
  unit_nama?: string | null;
  nip?: string | null;
  jabatan?: string | null;
  email?: string | null;
}

export const is = (u: Pick<Actor, 'role'>, ...roles: Role[]) => roles.includes(u.role);

/** Peran yang melihat semua surat masuk. Viewer hanya yang tidak rahasia. */
export const SEES_ALL_IN: Role[] = ['superadmin', 'tu', 'pimpinan'];
export const SEES_ALL_OUT: Role[] = ['superadmin', 'tu', 'pimpinan'];

export const can = {
  manageIn: (u: Pick<Actor, 'role'>) => is(u, 'superadmin', 'tu'),
  dispose: (u: Pick<Actor, 'role'>) => is(u, 'superadmin', 'pimpinan'),
  assign: (u: Pick<Actor, 'role'>) => is(u, 'superadmin', 'pimpinan', 'pejabat'),
  writeOut: (u: Pick<Actor, 'role'>) => is(u, 'superadmin', 'tu', 'pejabat', 'pelaksana'),
  approve: (u: Pick<Actor, 'role'>) => is(u, 'superadmin', 'pimpinan'),
  review: (u: Pick<Actor, 'role'>) => is(u, 'superadmin', 'pimpinan', 'pejabat'),
  admin: (u: Pick<Actor, 'role'>) => is(u, 'superadmin'),
  audit: (u: Pick<Actor, 'role'>) => is(u, 'superadmin', 'pimpinan'),
  report: (u: Pick<Actor, 'role'>) => !is(u, 'pelaksana'),
  work: (u: Pick<Actor, 'role'>) => !is(u, 'viewer'),
  ocr: (u: Pick<Actor, 'role'>) => is(u, 'superadmin', 'tu'),
};

/** Bentuk pengguna yang dikirim ke klien. */
export interface PublicUser {
  id: number;
  username: string;
  nama: string;
  nip: string | null;
  jabatan: string | null;
  role: Role;
  roleLabel: string;
  unitId: number | null;
  unitNama: string | null;
  email: string | null;
}

export const toPublicUser = (u: Actor): PublicUser => ({
  id: u.id,
  username: u.username,
  nama: u.nama,
  nip: u.nip ?? null,
  jabatan: u.jabatan ?? null,
  role: u.role,
  roleLabel: ROLE_LABEL[u.role],
  unitId: u.unit_id,
  unitNama: u.unit_nama ?? null,
  email: u.email ?? null,
});
