import { bad } from './util.js';

/**
 * Parameter halaman dan urutan yang aman. sorts memetakan kunci urutan ke ekspresi SQL tepercaya,
 * sehingga masukan pengguna tidak pernah masuk ke SQL secara langsung.
 */
export function pageParams(q, { sorts, defaultSort, defaultDir = 'desc', maxSize = 100 }) {
  const size = Math.min(Math.max(parseInt(q.pageSize, 10) || 20, 1), maxSize);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  const key = sorts[q.sort] ? q.sort : defaultSort;
  const dir = (q.dir || defaultDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return { page, pageSize: size, limit: size, offset: (page - 1) * size, sort: key, dir: dir.toLowerCase(), orderBy: `${sorts[key]} ${dir} NULLS LAST` };
}

export const csvList = (v) => (v ? String(v).split(',').map((x) => x.trim()).filter(Boolean).slice(0, 12) : []);

const cell = (v) => {
  let s = v == null ? '' : String(v);
  // Cegah injeksi rumus saat CSV dibuka di spreadsheet.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function sendCsv(res, filename, columns, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(`﻿${[columns, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`);
}

/** Jalankan aksi massal satu per satu. Satu kegagalan tidak membatalkan yang lain. */
export async function runBulk(ids, fn) {
  if (!Array.isArray(ids) || ids.length === 0) throw bad('Pilih minimal satu data');
  if (ids.length > 200) throw bad('Maksimal 200 data per aksi massal');
  const list = [...new Set(ids.map(Number).filter(Number.isInteger))];
  const results = [];
  for (const id of list) {
    try { await fn(id); results.push({ id, ok: true }); } catch (e) { results.push({ id, ok: false, error: e.status && e.status < 500 ? e.message : 'Terjadi kesalahan pada server' }); if (!e.status || e.status >= 500) console.error('bulk', id, e); }
  }
  return { results, ok: results.filter((r) => r.ok).length, gagal: results.filter((r) => !r.ok).length };
}
