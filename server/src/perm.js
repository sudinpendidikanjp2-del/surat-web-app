import { forbidden } from './util.js';

export const ROLES = ['superadmin', 'tu', 'pimpinan', 'pejabat', 'pelaksana', 'viewer'];
export const ROLE_LABEL = {
  superadmin: 'Super Admin',
  tu: 'Tata Usaha',
  pimpinan: 'Pimpinan',
  pejabat: 'Pejabat / Koordinator',
  pelaksana: 'Pelaksana',
  viewer: 'Viewer',
};

export const is = (u, ...roles) => roles.includes(u.role);
export const requireRole = (...roles) => (req, _res, next) => (is(req.user, ...roles) ? next() : next(forbidden()));

/** Peran yang melihat semua surat masuk (viewer hanya yang tidak rahasia). */
export const SEES_ALL_IN = ['superadmin', 'tu', 'pimpinan'];

/**
 * Potongan WHERE untuk daftar surat masuk yang boleh dilihat user.
 * Mengembalikan { sql, params } dengan placeholder dimulai dari $offset+1.
 */
export function visibleLettersIn(user, alias = 'li', offset = 0) {
  const a = alias;
  if (SEES_ALL_IN.includes(user.role)) return { sql: 'TRUE', params: [] };
  if (user.role === 'viewer') return { sql: `${a}.sifat <> 'Rahasia'`, params: [] };
  const uid = `$${offset + 1}`;
  const unit = `$${offset + 2}`;
  const unitClause = user.role === 'pejabat' ? `OR d.to_unit_id = ${unit}` : '';
  return {
    sql: `(${a}.created_by = ${uid}
      OR EXISTS (SELECT 1 FROM dispositions d WHERE d.letter_in_id=${a}.id AND (d.to_user_id=${uid} OR d.from_user_id=${uid} ${unitClause}))
      OR EXISTS (SELECT 1 FROM tasks t WHERE t.letter_in_id=${a}.id AND (t.pic_user_id=${uid} OR t.assigner_id=${uid}))
      OR EXISTS (SELECT 1 FROM letters_out lo WHERE lo.letter_in_id=${a}.id AND lo.created_by=${uid}))`,
    params: user.role === 'pejabat' ? [user.id, user.unit_id ?? 0] : [user.id],
  };
}

/** WHERE untuk daftar surat keluar yang boleh dilihat user. */
export function visibleLettersOut(user, alias = 'lo', offset = 0) {
  const a = alias;
  if (['superadmin', 'tu', 'pimpinan'].includes(user.role)) return { sql: 'TRUE', params: [] };
  if (user.role === 'viewer') return { sql: `${a}.status IN ('DIKIRIM','SELESAI')`, params: [] };
  const uid = `$${offset + 1}`;
  const unit = `$${offset + 2}`;
  const unitClause = user.role === 'pejabat' ? `OR EXISTS (SELECT 1 FROM users cu WHERE cu.id=${a}.created_by AND cu.unit_id=${unit})` : '';
  return { sql: `(${a}.created_by=${uid} ${unitClause})`, params: user.role === 'pejabat' ? [user.id, user.unit_id ?? 0] : [user.id] };
}

export const canManageIn = (u) => is(u, 'superadmin', 'tu');
export const canDispose = (u) => is(u, 'superadmin', 'pimpinan');
export const canAssign = (u) => is(u, 'superadmin', 'pimpinan', 'pejabat');
export const canWriteOut = (u) => is(u, 'superadmin', 'tu', 'pejabat', 'pelaksana');
export const canApprove = (u) => is(u, 'superadmin', 'pimpinan');
export const canReview = (u) => is(u, 'superadmin', 'pimpinan', 'pejabat');
export const canAdmin = (u) => is(u, 'superadmin');
