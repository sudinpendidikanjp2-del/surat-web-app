import type { Actor } from './roles';
import { is } from './roles';
import { slaIndicator } from './sla';

export const TASK_STATUS = {
  BELUM_DIMULAI: 'Belum dimulai',
  DITERIMA: 'Sudah diterima',
  DIPROSES: 'Sedang dikerjakan',
  MENUNGGU_DATA: 'Menunggu data',
  MENUNGGU_KONFIRMASI: 'Menunggu konfirmasi',
  MENUNGGU_PERSETUJUAN: 'Menunggu persetujuan',
  SELESAI: 'Selesai',
  DIBATALKAN: 'Dibatalkan',
} as const;
export type TaskStatus = keyof typeof TASK_STATUS;
export const TASK_STATUSES = Object.keys(TASK_STATUS) as TaskStatus[];
export const CLOSED_TASK: TaskStatus[] = ['SELESAI', 'DIBATALKAN'];

export interface ChecklistItem { teks: string; selesai: boolean }

export interface Task {
  id: number;
  letter_in_id: number;
  disposition_id: number | null;
  judul: string;
  deskripsi: string | null;
  pic_user_id: number;
  assigner_id: number;
  deadline: string | null;
  prioritas: string;
  status: TaskStatus;
  progress: number;
  checklist: ChecklistItem[];
}

export const isClosed = (t: Pick<Task, 'status'>) => CLOSED_TASK.includes(t.status);
export const isAssigner = (user: Actor, t: Pick<Task, 'assigner_id'>) => t.assigner_id === user.id || is(user, 'superadmin', 'pimpinan');

export const taskSla = (t: Pick<Task, 'deadline' | 'status'>) => slaIndicator(t.deadline, new Date(), isClosed(t));

export function taskAbilities(user: Actor, t: Pick<Task, 'pic_user_id' | 'assigner_id' | 'status'>) {
  const pic = t.pic_user_id === user.id;
  const assigner = isAssigner(user, t);
  const closed = isClosed(t);
  return { update: (pic || assigner) && !closed, batal: assigner && !closed, edit: assigner && !closed, buka: assigner && closed };
}

/**
 * Status dan progres berikutnya dari sebuah pembaruan. Selesai berarti 100%.
 * Progres di atas nol pada tugas yang belum dimulai berarti tugas sedang dikerjakan.
 */
export function nextTaskState(current: Pick<Task, 'status' | 'progress'>, input: { status: TaskStatus | null; progress: number | null; checklist: ChecklistItem[] | null }) {
  let progress = input.progress;
  let next: TaskStatus = input.status || current.status;
  if (input.checklist && progress == null && input.checklist.length) {
    progress = Math.round((input.checklist.filter((c) => c.selesai).length / input.checklist.length) * 100);
  }
  if (next === 'SELESAI') progress = 100;
  if (progress != null && progress > 0 && ['BELUM_DIMULAI', 'DITERIMA'].includes(next) && !input.status) next = 'DIPROSES';
  if (progress === 100 && !input.status && next === 'DIPROSES') next = 'SELESAI';
  return { status: next, progress: progress ?? current.progress };
}
