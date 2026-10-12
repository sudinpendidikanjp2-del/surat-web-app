import { SEES_ALL_IN, SEES_ALL_OUT } from '@/domain/roles';
import type { Role } from '@/domain/roles';

/**
 * Terjemahan kebijakan "siapa boleh melihat surat apa" ke potongan WHERE.
 * Placeholder dimulai dari $offset+1 agar dapat digabung dengan parameter lain.
 */
export interface Viewer { id: number; role: Role; unit_id: number | null }
export interface Fragment { sql: string; params: unknown[] }

export function visibleLettersIn(user: Viewer, alias = 'li', offset = 0): Fragment {
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

export function visibleLettersOut(user: Viewer, alias = 'lo', offset = 0): Fragment {
  const a = alias;
  if (SEES_ALL_OUT.includes(user.role)) return { sql: 'TRUE', params: [] };
  if (user.role === 'viewer') return { sql: `${a}.status IN ('DIKIRIM','SELESAI')`, params: [] };
  const uid = `$${offset + 1}`;
  const unit = `$${offset + 2}`;
  const unitClause = user.role === 'pejabat' ? `OR EXISTS (SELECT 1 FROM users cu WHERE cu.id=${a}.created_by AND cu.unit_id=${unit})` : '';
  return { sql: `(${a}.created_by=${uid} ${unitClause})`, params: user.role === 'pejabat' ? [user.id, user.unit_id ?? 0] : [user.id] };
}

/** Pembangun WHERE. `add`: semua `?` memakai satu nilai yang sama. `addEach`: tiap `?` nilainya sendiri. */
export class Where {
  readonly params: unknown[];
  private readonly parts: string[];
  constructor(base: Fragment) {
    this.params = [...base.params];
    this.parts = [base.sql];
  }
  add(cond: string, val: unknown) {
    this.params.push(val);
    const n = this.params.length;
    this.parts.push(cond.replace(/\?/g, `$${n}`));
    return this;
  }
  /** Setiap `?` mendapat nilainya sendiri, berurutan. */
  addEach(cond: string, ...vals: unknown[]) {
    let i = 0;
    const sql = cond.replace(/\?/g, () => { this.params.push(vals[i++]); return `$${this.params.length}`; });
    this.parts.push(sql);
    return this;
  }
  raw(cond: string) {
    this.parts.push(cond);
    return this;
  }
  get sql() { return this.parts.join(' AND '); }
}

/**
 * Halaman dan urutan yang aman. `sorts` memetakan kunci urutan ke ekspresi SQL tepercaya,
 * sehingga masukan pengguna tidak pernah masuk ke SQL secara langsung.
 */
export function pageParams(q: Record<string, string | undefined>, { sorts, defaultSort, defaultDir = 'desc', maxSize = 100 }: { sorts: Record<string, string>; defaultSort: string; defaultDir?: 'asc' | 'desc'; maxSize?: number }) {
  const size = Math.min(Math.max(parseInt(q.pageSize || '', 10) || 20, 1), maxSize);
  const page = Math.max(parseInt(q.page || '', 10) || 1, 1);
  const key = q.sort && sorts[q.sort] ? q.sort : defaultSort;
  const dir = (q.dir || defaultDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return { page, pageSize: size, limit: size, offset: (page - 1) * size, orderBy: `${sorts[key]} ${dir} NULLS LAST` };
}

export const like = (s: string) => `%${s}%`;
