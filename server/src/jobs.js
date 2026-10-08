import { all, q } from './db.js';
import { notify } from './record.js';
import { config } from './config.js';

const DAY = 86400000;
const toUTC = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };

/**
 * Pengingat tugas: H-3, H-1, hari H, terlambat. Eskalasi saat terlambat: pemberi tugas lalu pimpinan.
 * Aman dijalankan berulang karena notifikasi memakai dedupe_key.
 */
export async function runReminders(now = new Date()) {
  const todayMs = toUTC(now.toISOString().slice(0, 10));
  const tasks = await all(
    `SELECT t.id,t.judul,t.deadline,t.pic_user_id,t.assigner_id,li.no_agenda
       FROM tasks t JOIN letters_in li ON li.id=t.letter_in_id
      WHERE t.status NOT IN ('SELESAI','DIBATALKAN') AND t.deadline IS NOT NULL AND t.deadline <= (current_date + 3)`,
  );
  const leaders = (await all(`SELECT id FROM users WHERE role='pimpinan' AND aktif`)).map((u) => u.id);
  let sent = 0;
  for (const t of tasks) {
    const diff = Math.round((toUTC(t.deadline) - todayMs) / DAY);
    const link = `/tugas/${t.id}`;
    const label = `${t.judul} (${t.no_agenda})`;
    if (diff === 3) await notify(null, [t.pic_user_id], { tipe: 'pengingat', judul: 'Tugas Anda jatuh tempo 3 hari lagi', isi: label, link, dedupe: `rem:${t.id}:H3:${t.deadline}` });
    else if (diff === 1) await notify(null, [t.pic_user_id], { tipe: 'pengingat', judul: 'Tugas Anda jatuh tempo besok', isi: label, link, dedupe: `rem:${t.id}:H1:${t.deadline}` });
    else if (diff === 0) await notify(null, [t.pic_user_id], { tipe: 'pengingat', judul: 'Tugas Anda jatuh tempo hari ini', isi: label, link, dedupe: `rem:${t.id}:H0:${t.deadline}` });
    else if (diff < 0) {
      await notify(null, [t.pic_user_id], { tipe: 'terlambat', judul: 'Tugas Anda telah melewati batas waktu', isi: label, link, dedupe: `rem:${t.id}:LATE:${t.deadline}` });
      await notify(null, [t.assigner_id, ...leaders], { tipe: 'terlambat', judul: 'Tugas terlambat dan dieskalasi', isi: label, link, dedupe: `esk:${t.id}:${t.deadline}` });
    }
    sent += 1;
  }
  await q('DELETE FROM sessions WHERE expires_at < now()');
  return sent;
}

export function startJobs() {
  const tick = () => runReminders().catch((e) => console.error('Pengingat gagal:', e.message));
  setTimeout(tick, 5000).unref();
  return setInterval(tick, config.reminderEveryMs).unref();
}
