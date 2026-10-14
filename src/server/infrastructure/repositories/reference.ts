import type { InstansiFilter, InstansiRepo, RefsRepo } from '@/server/application/ports';
import type { Instansi, RefItem } from '@/domain/reference';
import type { Db } from '../db/client';
import { like, pageParams, Where } from '../db/visibility';

export const refsRepo = (db: Db): RefsRepo => ({
  list: (kategori, onlyActive) => db.all<RefItem>(
    `SELECT id,kategori,nilai,keterangan,urutan,aktif FROM ref_items WHERE kategori=$1 ${onlyActive ? 'AND aktif' : ''} ORDER BY urutan, lower(nilai)`, [kategori]),
  count: async (kategori) => (await db.one<{ n: number }>('SELECT count(*)::int AS n FROM ref_items WHERE kategori=$1', [kategori]))!.n,
  find: (id) => db.one<RefItem>('SELECT id,kategori,nilai,keterangan,urutan,aktif FROM ref_items WHERE id=$1', [id]),
  exists: async (kategori, nilai, exceptId) => Boolean(await db.one('SELECT 1 FROM ref_items WHERE kategori=$1 AND lower(nilai)=lower($2) AND id<>$3', [kategori, nilai, exceptId ?? 0])),
  canonical: async (kategori, nilai) => (await db.one<{ nilai: string }>('SELECT nilai FROM ref_items WHERE kategori=$1 AND lower(nilai)=lower($2) AND aktif', [kategori, nilai.trim()]))?.nilai ?? null,
  insert: async (v) => (await db.one<{ id: number }>('INSERT INTO ref_items(kategori,nilai,keterangan,urutan) VALUES($1,$2,$3,$4) RETURNING id', [v.kategori, v.nilai, v.keterangan, v.urutan]))!.id,
  update: async (id, v) => Boolean(await db.one('UPDATE ref_items SET nilai=$1, keterangan=$2, urutan=$3, aktif=$4 WHERE id=$5 RETURNING id', [v.nilai, v.keterangan, v.urutan, v.aktif, id])),
  setActive: async (id, aktif) => Boolean(await db.one('UPDATE ref_items SET aktif=$1 WHERE id=$2 RETURNING id', [aktif, id])),
});

const SORTS = { nama: 'lower(i.nama)', singkatan: 'lower(i.singkatan)', surat: 'jumlah_surat', dibuat: 'i.id' };
const COLS = `i.id,i.nama,i.singkatan,i.alamat,i.telepon,i.email,i.aktif,
  (SELECT count(*)::int FROM letters_in li WHERE lower(li.instansi)=lower(i.nama)) AS jumlah_surat`;

function where(f: InstansiFilter) {
  const w = new Where({ sql: 'TRUE', params: [] });
  if (f.aktif != null) w.add('i.aktif = ?', f.aktif);
  if (f.q) w.add('(i.nama ILIKE ? OR i.singkatan ILIKE ? OR i.alamat ILIKE ?)', like(f.q));
  return w;
}

export const instansiRepo = (db: Db): InstansiRepo => ({
  async list(f, q) {
    const w = where(f);
    const pg = pageParams(q, { sorts: SORTS, defaultSort: 'nama', defaultDir: 'asc' });
    const items = await db.all<Instansi>(`SELECT ${COLS} FROM instansi i WHERE ${w.sql} ORDER BY i.aktif DESC, ${pg.orderBy} LIMIT ${pg.limit} OFFSET ${pg.offset}`, w.params);
    const total = (await db.one<{ n: number }>(`SELECT count(*)::int AS n FROM instansi i WHERE ${w.sql}`, w.params))!.n;
    return { items, total, page: pg.page, pageSize: pg.pageSize };
  },
  all(f) {
    const w = where(f);
    return db.all<Instansi>(`SELECT ${COLS} FROM instansi i WHERE ${w.sql} ORDER BY lower(i.nama) LIMIT 5000`, w.params);
  },
  options: () => db.all('SELECT id,nama,singkatan,alamat FROM instansi WHERE aktif ORDER BY lower(nama)'),
  find: (id) => db.one<Instansi>(`SELECT ${COLS} FROM instansi i WHERE i.id=$1`, [id]),
  idByName: async (nama) => (await db.one<{ id: number }>('SELECT id FROM instansi WHERE lower(nama)=lower($1)', [nama.trim()]))?.id ?? null,
  insert: async (v) => (await db.one<{ id: number }>('INSERT INTO instansi(nama,singkatan,alamat,telepon,email) VALUES($1,$2,$3,$4,$5) RETURNING id', [v.nama, v.singkatan, v.alamat, v.telepon, v.email]))!.id,
  update: async (id, v) => Boolean(await db.one('UPDATE instansi SET nama=$1,singkatan=$2,alamat=$3,telepon=$4,email=$5,aktif=$6 WHERE id=$7 RETURNING id', [v.nama, v.singkatan, v.alamat, v.telepon, v.email, v.aktif, id])),
  setActive: async (id, aktif) => Boolean(await db.one('UPDATE instansi SET aktif=$1 WHERE id=$2 RETURNING id', [aktif, id])),
});
