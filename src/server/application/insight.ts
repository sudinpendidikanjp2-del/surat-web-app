import { forbidden, invalid } from '@/domain/errors';
import { BULAN } from '@/domain/calendar';
import { isFinished, STATUS_IN, type StatusIn } from '@/domain/letter-in';
import { STATUS_OUT, type StatusOut } from '@/domain/letter-out';
import { can, is } from '@/domain/roles';
import { slaIndicator } from '@/domain/sla';
import { dateStr, int, oneOf } from '@/domain/validation';
import type { Ctx, Deps } from './context';

/* ---------- Beranda ---------- */

export async function dashboard(d: Deps, ctx: Ctx) {
  const q = d.uow.read.insightQueries;
  const u = ctx.actor;
  const year = new Date().getFullYear();
  const out: Record<string, unknown> = { role: u.role, counts: await q.countsIn(u, year), keluar: await q.countsOut(u, year) };
  if (is(u, 'pimpinan', 'superadmin')) {
    const [perlu, perhatian, persetujuan, monthly, perUnit, avg] = await Promise.all([
      q.awaitingDisposition(), q.tasksNeedingAttention(), q.awaitingApproval(), q.monthly(year), q.perUnit(), q.averageDaysToFinish(),
    ]);
    Object.assign(out, {
      perlu_disposisi: perlu, tugas_perhatian: perhatian, perlu_persetujuan: persetujuan,
      per_bulan: BULAN.map((nama, i) => ({ bulan: nama.slice(0, 3), masuk: monthly.masuk[i + 1] || 0, selesai: monthly.selesai[i + 1] || 0 })),
      per_unit: perUnit, rata_hari_selesai: avg,
    });
  }
  if (is(u, 'tu', 'superadmin')) {
    const [antrian, nomor, monthly] = await Promise.all([q.notForwarded(), q.lastNumber(), q.monthly(year)]);
    Object.assign(out, { antrian_tu: antrian, nomor_terakhir: nomor });
    if (!out.per_bulan) out.per_bulan = BULAN.map((nama, i) => ({ bulan: nama.slice(0, 3), masuk: monthly.masuk[i + 1] || 0, selesai: monthly.selesai[i + 1] || 0 }));
  }
  if (!is(u, 'viewer')) {
    const [tugas, disp, terdekat] = await Promise.all([q.myTaskCounts(u.id), q.newDispositionsFor(u), q.myNearestTasks(u.id)]);
    Object.assign(out, { tugas_saya: tugas, disposisi_baru: disp, tugas_terdekat: terdekat.map((x) => ({ ...x, sla: slaIndicator(x.deadline) })) });
  }
  return out;
}

/* ---------- Pencarian ---------- */

export async function search(d: Deps, ctx: Ctx, q: Record<string, string | undefined>) {
  const f = {
    q: String(q.q || '').trim().slice(0, 100),
    jenis: oneOf(q.jenis || 'semua', ['semua', 'masuk', 'keluar'] as const, 'Jenis'),
    from: dateStr(q.from, 'Dari tanggal', { required: false }),
    to: dateStr(q.to, 'Sampai tanggal', { required: false }),
    status: q.status || null, sifat: q.sifat || null, prioritas: q.prioritas || null,
    unit: int(q.unit, 'Unit', { required: false }),
    pic: int(q.pic, 'PIC', { required: false }),
    tahun: int(q.tahun, 'Tahun', { required: false, min: 2000, max: 2100 }),
  };
  const results: Record<string, unknown>[] = [];
  if (f.jenis !== 'keluar') {
    for (const x of await d.uow.read.insightQueries.searchIn(ctx.actor, f)) {
      results.push({ ...x, tipe: 'masuk', statusLabel: STATUS_IN[x.status as StatusIn], sla: slaIndicator(x.deadline, new Date(), isFinished(x.status)) });
    }
  }
  if (f.jenis !== 'masuk' && !f.sifat && !f.prioritas) {
    for (const x of await d.uow.read.insightQueries.searchOut(ctx.actor, f)) results.push({ ...x, tipe: 'keluar', statusLabel: STATUS_OUT[x.status as StatusOut] });
  }
  return results.sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)));
}

/* ---------- Arsip ---------- */

export async function archiveTree(d: Deps, ctx: Ctx) {
  const { masuk, keluar } = await d.uow.read.insightQueries.archiveCounts(ctx.actor);
  const years = [...new Set([...masuk, ...keluar].map((x) => x.tahun))].sort((a, b) => b - a);
  const month = (rows: typeof masuk, tahun: number) => BULAN.map((nama, i) => ({ bulan: i + 1, nama, jumlah: rows.find((x) => x.tahun === tahun && x.bulan === i + 1)?.n || 0 }));
  return years.map((tahun) => ({ tahun, masuk: month(masuk, tahun), keluar: month(keluar, tahun) }));
}

export function archiveList(d: Deps, ctx: Ctx, q: Record<string, string | undefined>) {
  return d.uow.read.insightQueries.archiveList(ctx.actor, {
    tahun: int(q.tahun, 'Tahun', { min: 2000, max: 2100 }),
    bulan: int(q.bulan, 'Bulan', { min: 1, max: 12 }),
    jenis: oneOf(q.jenis, ['masuk', 'keluar'] as const, 'Jenis'),
  });
}

/* ---------- Laporan ---------- */

export const REPORT_KINDS = ['surat-masuk', 'surat-keluar', 'disposisi', 'tindak-lanjut', 'kinerja'] as const;

export async function report(d: Deps, ctx: Ctx, jenisRaw: string, q: Record<string, string | undefined>) {
  if (!can.report(ctx.actor)) throw forbidden('Laporan tidak tersedia untuk peran Anda');
  const jenis = oneOf(jenisRaw, REPORT_KINDS, 'Jenis laporan');
  const year = new Date().getFullYear();
  const from = dateStr(q.from, 'Dari tanggal', { required: false }) || `${year}-01-01`;
  const to = dateStr(q.to, 'Sampai tanggal', { required: false }) || `${year}-12-31`;
  if (from > to) throw invalid('Tanggal awal tidak boleh setelah tanggal akhir');
  const tables = await d.uow.read.reportQueries.build(ctx.actor, jenis, from, to);
  const catatan = jenis === 'kinerja'
    ? 'Terlambat: surat selesai setelah batas waktu, atau belum selesai dan batas waktunya sudah lewat. Ketepatan = surat tidak terlambat dibagi jumlah surat. Batas waktu = batas disposisi terdekat, atau batas bawaan menurut prioritas bila belum ada disposisi.'
    : null;
  return { jenis, from, to, tables, catatan };
}

export async function statistics(d: Deps, ctx: Ctx, q: Record<string, string | undefined>) {
  const tahun = int(q.tahun, 'Tahun', { required: false, min: 2000, max: 2100 }) || new Date().getFullYear();
  return { tahun, ...(await d.uow.read.insightQueries.yearStats(ctx.actor, tahun)) };
}
