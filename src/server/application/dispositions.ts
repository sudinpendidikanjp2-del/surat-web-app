import { conflict, forbidden, notFound } from '@/domain/errors';
import { holdsDisposition } from '@/domain/letter-in';
import { str } from '@/domain/validation';
import { auditFor, runBulk, type Ctx, type Deps } from './context';
import type { DispositionFilter } from './ports';
import { loadLetterIn, recomputeStatus } from './shared';

const filterOf = (q: Record<string, string | undefined>): DispositionFilter => ({
  scope: q.scope === 'semua' ? 'semua' : 'saya', status: q.status, prioritas: q.prioritas, q: q.q?.slice(0, 100), antrian: q.antrian,
});

export const list = (d: Deps, ctx: Ctx, q: Record<string, string | undefined>) => d.uow.read.dispositionQueries.list(ctx.actor, filterOf(q), q);
export const ids = (d: Deps, ctx: Ctx, q: Record<string, string | undefined>) => d.uow.read.dispositionQueries.ids(ctx.actor, filterOf(q));

async function acceptOne(d: Deps, ctx: Ctx, id: number) {
  await d.uow.run(async (r) => {
    const disp = await r.dispositions.lock(id);
    if (!disp) throw notFound();
    if (!holdsDisposition(ctx.actor, disp)) throw forbidden('Disposisi ini bukan untuk Anda');
    if (disp.status !== 'BARU') throw conflict('Disposisi sudah diterima atau diproses');
    const li = await loadLetterIn(r, ctx.actor, disp.letter_in_id);
    await r.dispositions.accept(id, ctx.actor.id);
    await r.journal.event({ letterInId: li.id, userId: ctx.actor.id, tipe: 'terima', teks: `Disposisi diterima oleh ${ctx.actor.nama}`, meta: { disposition_id: id } });
    await r.journal.notify([disp.from_user_id], { tipe: 'disposisi', judul: 'Disposisi Anda sudah diterima', isi: `${ctx.actor.nama} menerima disposisi ${li.no_agenda}`, link: `/surat-masuk/${li.id}` }, ctx.actor.id);
    await recomputeStatus(r, li.id);
    await auditFor(r, ctx, 'DISPOSISI_DITERIMA', 'disposition', id, { letter: li.id });
  });
}
export const accept = acceptOne;
export const acceptMany = (d: Deps, ctx: Ctx, ids: unknown) => runBulk(ids, (id) => acceptOne(d, ctx, id));

/** Kembalikan disposisi kepada pemberinya dengan alasan. */
export async function giveBack(d: Deps, ctx: Ctx, id: number, b: { alasan?: unknown }) {
  const alasan = str(b.alasan, 'Alasan pengembalian', { max: 1000 });
  await d.uow.run(async (r) => {
    const disp = await r.dispositions.lock(id);
    if (!disp) throw notFound();
    if (!holdsDisposition(ctx.actor, disp)) throw forbidden('Disposisi ini bukan untuk Anda');
    if (!['BARU', 'DITERIMA'].includes(disp.status)) throw conflict('Disposisi tidak dapat dikembalikan pada status ini');
    const li = await loadLetterIn(r, ctx.actor, disp.letter_in_id);
    if ((await r.dispositions.openTaskCount(id)) > 0) throw conflict('Masih ada tugas terbuka pada disposisi ini. Selesaikan atau batalkan dahulu');
    await r.dispositions.giveBack(id, alasan);
    // Bila induknya sudah diteruskan, hidupkan kembali agar pemberi dapat bertindak lagi.
    if (disp.parent_id) await r.dispositions.revive(disp.parent_id);
    await r.journal.event({ letterInId: li.id, userId: ctx.actor.id, tipe: 'kembali', teks: `Disposisi dikembalikan oleh ${ctx.actor.nama}: ${alasan}`, meta: { disposition_id: id } });
    await r.journal.notify([disp.from_user_id], { tipe: 'disposisi', judul: 'Disposisi dikembalikan', isi: `${li.no_agenda}: ${alasan}`, link: `/surat-masuk/${li.id}` }, ctx.actor.id);
    await recomputeStatus(r, li.id);
    await auditFor(r, ctx, 'DISPOSISI_DIKEMBALIKAN', 'disposition', id, { alasan });
  });
}
