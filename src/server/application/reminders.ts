import { daysFromToday } from '@/domain/sla';
import type { Deps } from './context';

/**
 * Pengingat tugas: 3 hari lagi, besok, hari ini, terlambat. Saat terlambat, pemberi tugas dan pimpinan
 * ikut diberi tahu. Aman dijalankan berulang karena setiap notifikasi punya kunci unik.
 */
export async function runReminders(d: Deps, now = new Date()) {
  return d.uow.run(async (r) => {
    const tasks = await r.tasks.dueSoon();
    const leaders = await r.users.activeIdsByRole(['pimpinan']);
    for (const t of tasks) {
      const diff = daysFromToday(t.deadline, now);
      const link = `/tugas/${t.id}`;
      const isi = `${t.judul} (${t.no_agenda})`;
      const send = (ids: number[], tipe: string, judul: string, key: string) => r.journal.notify(ids, { tipe, judul, isi, link, dedupe: key });
      if (diff === 3) await send([t.pic_user_id], 'pengingat', 'Tugas Anda jatuh tempo 3 hari lagi', `rem:${t.id}:H3:${t.deadline}`);
      else if (diff === 1) await send([t.pic_user_id], 'pengingat', 'Tugas Anda jatuh tempo besok', `rem:${t.id}:H1:${t.deadline}`);
      else if (diff === 0) await send([t.pic_user_id], 'pengingat', 'Tugas Anda jatuh tempo hari ini', `rem:${t.id}:H0:${t.deadline}`);
      else if (diff < 0) {
        await send([t.pic_user_id], 'terlambat', 'Tugas Anda sudah melewati batas waktu', `rem:${t.id}:LATE:${t.deadline}`);
        await send([t.assigner_id, ...leaders], 'terlambat', 'Tugas terlambat dan diteruskan ke atasan', `esk:${t.id}:${t.deadline}`);
      }
    }
    await r.sessions.deleteExpired();
    return tasks.length;
  });
}
