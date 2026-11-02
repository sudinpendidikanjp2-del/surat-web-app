import { conflict, forbidden, invalid, notFound } from '@/domain/errors';
import { PRIORITAS } from '@/domain/letter-in';
import { isAssigner, isClosed, nextTaskState, TASK_STATUS, TASK_STATUSES, taskAbilities, taskSla, type ChecklistItem, type TaskStatus } from '@/domain/task';
import { dateStr, int, oneOf, str } from '@/domain/validation';
import type { Actor } from '@/domain/roles';
import { auditFor, runBulk, type Ctx, type Deps } from './context';
import type { IncomingFile, Repos, TaskFilter } from './ports';
import { loadLetterIn, recomputeStatus, saveAttachment } from './shared';

type Body = Record<string, unknown>;

const filterOf = (q: Record<string, string | undefined>): TaskFilter => ({
  scope: q.scope === 'diberikan' || q.scope === 'semua' ? q.scope : 'saya',
  status: q.status, prioritas: q.prioritas, q: q.q?.slice(0, 100), antrian: q.antrian,
  pic: int(q.pic, 'PIC', { required: false }),
  from: dateStr(q.from, 'Dari tanggal', { required: false }),
  to: dateStr(q.to, 'Sampai tanggal', { required: false }),
});

const decorate = <T extends { status: string; deadline: string | null }>(t: T) =>
  ({ ...t, statusLabel: TASK_STATUS[t.status as TaskStatus], sla: taskSla(t as never) });

export async function list(d: Deps, ctx: Ctx, q: Record<string, string | undefined>) {
  const page = await d.uow.read.taskQueries.list(ctx.actor, filterOf(q), q);
  return { ...page, items: page.items.map(decorate) };
}

export async function exportRows(d: Deps, ctx: Ctx, q: Record<string, string | undefined>) {
  const rows = (await d.uow.read.taskQueries.exportRows(ctx.actor, filterOf(q), q)).map(decorate);
  return {
    columns: ['No. Agenda', 'Tugas', 'Penanggung jawab', 'Pemberi tugas', 'Batas waktu', 'Prioritas', 'Progres', 'Status'],
    rows: rows.map((t) => [t.no_agenda, t.judul, t.pic_nama, t.assigner_nama, t.deadline, t.prioritas, `${t.progress}%`, t.statusLabel]),
  };
}

export const ids = (d: Deps, ctx: Ctx, q: Record<string, string | undefined>) => d.uow.read.taskQueries.ids(ctx.actor, filterOf(q));

async function loadTask(r: Repos, actor: Actor, id: number) {
  const t = await r.tasks.find(id);
  if (!t) throw notFound('Tugas tidak ditemukan');
  await loadLetterIn(r, actor, t.letter_in_id);
  return t;
}

export async function detail(d: Deps, ctx: Ctx, id: number) {
  const r = d.uow.read;
  const t = await loadTask(r, ctx.actor, id);
  const [updates, attachments] = await Promise.all([r.tasks.updates(id), r.attachments.forTask(id)]);
  return { task: decorate(t), updates, attachments, can: taskAbilities(ctx.actor, t) };
}

/** Ubah isi tugas. Hanya pemberi tugas. */
export async function update(d: Deps, ctx: Ctx, id: number, b: Body) {
  const data = {
    judul: str(b.judul, 'Judul tugas', { max: 200 }),
    deskripsi: str(b.deskripsi, 'Deskripsi', { max: 2000, required: false }),
    deadline: dateStr(b.deadline, 'Batas waktu'),
    prioritas: oneOf(b.prioritas, PRIORITAS, 'Prioritas'),
    picUserId: int(b.pic_user_id, 'Penanggung jawab'),
  };
  await d.uow.run(async (r) => {
    const t = await loadTask(r, ctx.actor, id);
    if (!isAssigner(ctx.actor, t)) throw forbidden();
    if (isClosed(t)) throw conflict('Tugas sudah ditutup');
    if (!(await r.users.isActive(data.picUserId))) throw invalid('Penanggung jawab tidak valid');
    await r.tasks.update(id, data);
    if (data.picUserId !== t.pic_user_id) await r.journal.notify([data.picUserId], { tipe: 'tugas', judul: 'Anda menerima tugas baru', isi: `${data.judul} (${t.no_agenda})`, link: `/tugas/${id}` }, ctx.actor.id);
    await r.journal.event({ letterInId: t.letter_in_id, userId: ctx.actor.id, tipe: 'tugas', teks: `Tugas "${data.judul}" diperbarui`, meta: { task_id: id } });
    await auditFor(r, ctx, 'TUGAS_DIUBAH', 'task', id, { judul: data.judul, deadline: data.deadline, pic: data.picUserId });
  });
}

function parseChecklist(raw: unknown): ChecklistItem[] | null {
  if (!raw) return null;
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw); } catch { throw invalid('Format daftar periksa tidak valid'); }
  }
  if (!Array.isArray(list)) throw invalid('Format daftar periksa tidak valid');
  return list.slice(0, 30).map((c: { teks?: unknown; selesai?: unknown }) => ({ teks: String(c?.teks || '').slice(0, 200), selesai: Boolean(c?.selesai) }));
}

/**
 * Pembaruan progres oleh penanggung jawab atau pemberi tugas. "Menunggu data" memerlukan catatan
 * dan memberi tahu pemberi tugas. "Selesai" menetapkan progres 100%.
 */
async function progressOne(d: Deps, ctx: Ctx, id: number, b: Body, files: IncomingFile[]) {
  const status = oneOf(b.status, TASK_STATUSES, 'Status', { required: false });
  const catatan = str(b.catatan, 'Catatan', { max: 2000, required: false });
  const progress = int(b.progress, 'Progres', { required: false, min: 0, max: 100 });
  const checklist = parseChecklist(b.checklist);
  for (const f of files) d.files.validate(f);
  await d.uow.run(async (r) => {
    const t = await loadTask(r, ctx.actor, id);
    const pic = t.pic_user_id === ctx.actor.id;
    const assigner = isAssigner(ctx.actor, t);
    if (!pic && !assigner) throw forbidden('Hanya penanggung jawab atau pemberi tugas yang dapat memperbarui tugas');
    if (isClosed(t)) throw conflict('Tugas sudah ditutup');
    if (status === 'DIBATALKAN' && !assigner) throw forbidden('Hanya pemberi tugas yang dapat membatalkan tugas');
    if (status === 'MENUNGGU_DATA' && !catatan) throw invalid('Jelaskan data yang diminta pada catatan');
    if (status === 'DIBATALKAN' && !catatan) throw invalid('Berikan alasan pembatalan pada catatan');
    const next = nextTaskState(t, { status, progress, checklist });
    await r.tasks.setProgress(id, next.status, next.progress, checklist);
    await r.tasks.addUpdate({ taskId: id, userId: ctx.actor.id, progress: next.progress, status: next.status, catatan });
    for (const f of files) {
      const a = await saveAttachment(d, r, { file: f, kategori: 'HASIL', letterInId: t.letter_in_id, taskId: id, userId: ctx.actor.id });
      await r.journal.event({ letterInId: t.letter_in_id, userId: ctx.actor.id, tipe: 'dokumen', teks: `Dokumen hasil diunggah: ${a.nama} (versi ${a.versi})`, meta: { attachment_id: a.id, task_id: id } });
    }
    const label = TASK_STATUS[next.status];
    await r.journal.event({
      letterInId: t.letter_in_id, userId: ctx.actor.id, tipe: next.status === 'MENUNGGU_DATA' ? 'minta_info' : 'progres',
      teks: `Tugas "${t.judul}": ${label}, progres ${next.progress}%${catatan ? `. ${catatan}` : ''}`, meta: { task_id: id },
    });
    if (next.status !== t.status && next.status !== 'DIPROSES') {
      await r.journal.notify(pic ? [t.assigner_id] : [t.pic_user_id], { tipe: 'tugas', judul: `Tugas ${label.toLowerCase()}`, isi: `${t.judul} (${t.no_agenda})${catatan ? `: ${catatan}` : ''}`, link: `/tugas/${id}` }, ctx.actor.id);
    }
    await recomputeStatus(r, t.letter_in_id);
    await auditFor(r, ctx, 'TUGAS_DIPERBARUI', 'task', id, { status: next.status, progress: next.progress });
  });
}
export const progress = progressOne;

export function setStatusMany(d: Deps, ctx: Ctx, b: Body) {
  const status = oneOf(b.status, ['DIPROSES', 'SELESAI', 'DIBATALKAN'] as const, 'Status');
  const catatan = b.catatan ? String(b.catatan) : status === 'DIBATALKAN' ? 'Dibatalkan melalui aksi massal' : undefined;
  return runBulk(b.ids, (id) => progressOne(d, ctx, id, { status, catatan }, []));
}

export function setDeadlineMany(d: Deps, ctx: Ctx, b: Body) {
  const deadline = dateStr(b.deadline, 'Batas waktu');
  return runBulk(b.ids, (id) => d.uow.run(async (r) => {
    const t = await loadTask(r, ctx.actor, id);
    if (!isAssigner(ctx.actor, t)) throw forbidden('Hanya pemberi tugas yang dapat mengubah batas waktu');
    if (isClosed(t)) throw conflict('Tugas sudah ditutup');
    await r.tasks.setDeadline(id, deadline);
    await r.journal.event({ letterInId: t.letter_in_id, userId: ctx.actor.id, tipe: 'tugas', teks: `Batas waktu tugas "${t.judul}" diubah menjadi ${deadline}`, meta: { task_id: id } });
    await r.journal.notify([t.pic_user_id], { tipe: 'tugas', judul: 'Batas waktu tugas diubah', isi: `${t.judul} (${t.no_agenda}): ${deadline}`, link: `/tugas/${id}` }, ctx.actor.id);
    await auditFor(r, ctx, 'TUGAS_TENGGAT_DIUBAH', 'task', id, { deadline });
  }));
}
