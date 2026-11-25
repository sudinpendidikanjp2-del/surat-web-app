import { conflict, forbidden, invalid } from '@/domain/errors';
import {
  DEFAULT_NUMBERING, formatNomor, letterOutAbilities, canEditOut, isOwnerOut, outAgenda, STATUS_OUT,
  type LetterOut, type NumberingConfig, type StatusOut,
} from '@/domain/letter-out';
import { can, is } from '@/domain/roles';
import { dateStr, int, oneOf, str, today } from '@/domain/validation';
import { auditFor, runBulk, type Ctx, type Deps } from './context';
import { refValue } from './reference';
import type { IncomingFile, LetterOutFilter, LetterOutRecord, Repos } from './ports';
import { loadLetterIn, loadLetterOut, mentionedUsernames, recomputeStatus, saveAttachment } from './shared';

/**
 * Surat keluar dicatat seperti surat masuk: surat sudah ditandatangani di luar aplikasi (dibuat di Word atau lewat
 * Buat Surat dari template), lalu dicatat nomor, tujuan, perihal, dan hasil pindainya, kemudian pengirimannya.
 */
type Body = Record<string, unknown>;

const filterOf = (q: Record<string, string | undefined>): LetterOutFilter => ({
  status: q.status, mine: q.mine === '1', jenis: q.jenis, antrian: q.antrian, q: q.q?.slice(0, 100),
  from: dateStr(q.from, 'Dari tanggal', { required: false }),
  to: dateStr(q.to, 'Sampai tanggal', { required: false }),
});

const label = <T extends { status: string }>(x: T) => ({ ...x, statusLabel: STATUS_OUT[x.status as StatusOut] ?? x.status });

export async function list(d: Deps, ctx: Ctx, q: Record<string, string | undefined>) {
  const page = await d.uow.read.letterOutQueries.list(ctx.actor, filterOf(q), q);
  return { ...page, items: page.items.map(label) };
}
export async function exportRows(d: Deps, ctx: Ctx, q: Record<string, string | undefined>) {
  const rows = await d.uow.read.letterOutQueries.exportRows(ctx.actor, filterOf(q), q);
  return {
    columns: ['No. Agenda', 'Nomor surat', 'Tanggal', 'Jenis', 'Tujuan', 'Perihal', 'Dicatat oleh', 'Status'],
    rows: rows.map((x) => [x.no_agenda, x.nomor_surat, x.tgl_surat, x.jenis, x.tujuan, x.perihal, x.pembuat, STATUS_OUT[x.status as StatusOut] ?? x.status]),
  };
}
export const ids = (d: Deps, ctx: Ctx, q: Record<string, string | undefined>) => d.uow.read.letterOutQueries.ids(ctx.actor, filterOf(q));

/* ---------- Nomor surat ---------- */

/** Nomor otomatis: urutan atomik per tahun dengan pola dari Pengaturan > Nomor surat. */
async function nextNomor(r: Repos, tglSurat: string, kode: string | null) {
  const cfg = (await r.settings.get<NumberingConfig>('penomoran')) || DEFAULT_NUMBERING;
  const inst = (await r.settings.get<Record<string, string>>('instansi')) || {};
  const urut = await r.journal.nextSeq(`NO-${tglSurat.slice(0, 4)}`);
  return formatNomor(cfg, { kode, urut, unit: inst.kode_unit || '', tglSurat });
}

/**
 * Nomor dari formulir: "manual" memakai nomor yang tertulis di surat; "otomatis" mengambil nomor urut berikutnya.
 * Nomor yang sama tidak boleh dipakai dua surat.
 */
async function resolveNomor(r: Repos, b: Body, tglSurat: string, exceptId?: number) {
  const mode = oneOf(b.nomor_mode || 'manual', ['manual', 'otomatis', 'nanti'] as const, 'Cara memberi nomor');
  if (mode === 'nanti') return null;
  const nomor = mode === 'otomatis'
    ? await nextNomor(r, tglSurat, str(b.kode_klasifikasi, 'Kode klasifikasi', { max: 20, required: false }))
    : str(b.nomor_surat, 'Nomor surat', { max: 120 });
  const dup = await r.lettersOut.byNomor(nomor, exceptId);
  if (dup) throw conflict(`Nomor ${nomor} sudah dipakai surat keluar ${dup.no_agenda}`);
  return nomor;
}

async function recordOf(r: Repos, b: Body): Promise<Omit<LetterOutRecord, 'nomor_surat'>> {
  const signer = int(b.penandatangan_id, 'Penandatangan', { required: false });
  if (signer && !(await r.users.isSigner(signer))) throw invalid('Penandatangan tidak valid');
  return {
    perihal: str(b.perihal, 'Perihal', { max: 500 }),
    tujuan: str(b.tujuan, 'Tujuan', { max: 500 }),
    tgl_surat: dateStr(b.tgl_surat, 'Tanggal surat'),
    jenis: await refValue(r, 'jenis_surat', b.jenis, 'Jenis surat', 'Surat Dinas'),
    sifat: await refValue(r, 'sifat', b.sifat, 'Sifat surat', 'Biasa'),
    lampiran: str(b.lampiran, 'Lampiran', { max: 200, required: false }),
    catatan: str(b.catatan, 'Catatan', { max: 1000, required: false }),
    penandatangan_id: signer,
  };
}

/* ---------- Catat dan ubah ---------- */

/** Catat surat keluar. `files`: hasil pindai surat yang sudah ditandatangani (boleh menyusul). */
export async function create(d: Deps, ctx: Ctx, b: Body, files: IncomingFile[] = []) {
  if (!can.writeOut(ctx.actor)) throw forbidden('Peran Anda tidak dapat mencatat surat keluar');
  for (const f of files) d.files.validate(f);
  return d.uow.run(async (r) => {
    const letterInId = int(b.letter_in_id, 'Surat masuk', { required: false });
    if (letterInId) await loadLetterIn(r, ctx.actor, letterInId);
    const rec = await recordOf(r, b);
    const nomor = await resolveNomor(r, b, rec.tgl_surat);
    const year = rec.tgl_surat.slice(0, 4);
    const no_agenda = outAgenda(year, await r.journal.nextSeq(`SK-${year}`));
    const lo = await r.lettersOut.insert({
      no_agenda, letterInId, jenis: rec.jenis, sifat: rec.sifat, perihal: rec.perihal, tujuan: rec.tujuan, lampiran: rec.lampiran,
      catatan: rec.catatan, nomorSurat: nomor, tglSurat: rec.tgl_surat, signerId: rec.penandatangan_id, createdBy: ctx.actor.id,
    });
    for (const f of files) await saveAttachment(d, r, { file: f, kategori: 'TTD', letterOutId: lo.id, userId: ctx.actor.id });
    await r.journal.event({
      letterInId, letterOutId: lo.id, userId: ctx.actor.id, tipe: 'surat_keluar',
      teks: `Surat keluar dicatat (${no_agenda}${nomor ? `, nomor ${nomor}` : ''})${files.length ? ` dengan ${files.length} berkas pindaian` : ''}`,
    });
    if (letterInId) await recomputeStatus(r, letterInId);
    await auditFor(r, ctx, 'SURAT_KELUAR_DICATAT', 'letter_out', lo.id, { no_agenda, nomor, letter_in: letterInId, berkas: files.length });
    return { id: lo.id, no_agenda, nomor_surat: nomor };
  });
}

export async function update(d: Deps, ctx: Ctx, id: number, b: Body) {
  await d.uow.run(async (r) => {
    await loadLetterOut(r, ctx.actor, id);
    const lo = (await r.lettersOut.lock(id))!;
    if (!canEditOut(ctx.actor, lo)) throw forbidden('Surat tidak dapat diubah pada status ini');
    const rec = await recordOf(r, b);
    // Nomor yang sudah ada hanya diganti bila diminta; surat tanpa nomor dapat diberi nomor di sini.
    const nomor = b.nomor_mode === 'tetap' && lo.nomor_surat ? lo.nomor_surat : await resolveNomor(r, b, rec.tgl_surat, id);
    await r.lettersOut.updateRecord(id, { ...rec, nomor_surat: nomor });
    await r.journal.event({ letterInId: lo.letter_in_id, letterOutId: id, userId: ctx.actor.id, tipe: 'surat_keluar', teks: `Data surat diperbarui${nomor && nomor !== lo.nomor_surat ? `, nomor ${nomor}` : ''}` });
    await auditFor(r, ctx, 'SURAT_KELUAR_DIUBAH', 'letter_out', id, { nomor });
  });
}

/* ---------- Detail ---------- */

export async function detail(d: Deps, ctx: Ctx, id: number) {
  const r = d.uow.read;
  const lo = await loadLetterOut(r, ctx.actor, id);
  const hideFiles = is(ctx.actor, 'viewer') && lo.status !== 'DIKIRIM';
  const [creator, signer, approvals, attachments, asal] = await Promise.all([
    r.users.name(lo.created_by),
    lo.penandatangan_id ? r.users.signer(lo.penandatangan_id) : Promise.resolve(null),
    r.lettersOut.approvals(id),
    hideFiles ? Promise.resolve([]) : r.attachments.forLetterOut(id),
    lo.letter_in_id ? r.lettersIn.summary(lo.letter_in_id) : Promise.resolve(null),
  ]);
  return {
    letter: { ...lo, statusLabel: STATUS_OUT[lo.status] ?? lo.status, pembuat: creator },
    signer: signer && { id: lo.penandatangan_id, nama: signer.nama, jabatan: signer.jabatan },
    // Riwayat persetujuan dari versi lama aplikasi (sebelum surat keluar menjadi pencatatan); kosong untuk surat baru.
    approvals, attachments, asal, can: letterOutAbilities(ctx.actor, lo),
    signed: (attachments as unknown as { kategori: string }[]).some((a) => a.kategori === 'TTD'),
  };
}

export async function timeline(d: Deps, ctx: Ctx, id: number) {
  await loadLetterOut(d.uow.read, ctx.actor, id);
  return d.uow.read.lettersOut.timeline(id);
}

/* ---------- Berkas, pengiriman, pembatalan ---------- */

async function lockOut(r: Repos, ctx: Ctx, id: number) {
  await loadLetterOut(r, ctx.actor, id);
  return (await r.lettersOut.lock(id))!;
}

const DOC_KINDS = ['TTD', 'PENDUKUNG'] as const;

/** Unggah hasil pindai surat bertanda tangan (TTD) atau dokumen pendukung. */
export async function uploadDocuments(d: Deps, ctx: Ctx, id: number, files: IncomingFile[], kategoriRaw: unknown) {
  const kategori = oneOf(kategoriRaw || 'PENDUKUNG', DOC_KINDS, 'Jenis dokumen');
  if (!files.length) throw invalid('Pilih file yang akan diunggah');
  for (const f of files) d.files.validate(f);
  await d.uow.run(async (r) => {
    const lo = await lockOut(r, ctx, id);
    if (!letterOutAbilities(ctx.actor, lo).unggah) throw forbidden();
    for (const f of files) {
      const a = await saveAttachment(d, r, { file: f, kategori, letterOutId: id, userId: ctx.actor.id });
      await r.journal.event({ letterInId: lo.letter_in_id, letterOutId: id, userId: ctx.actor.id, tipe: 'dokumen', teks: `${kategori === 'TTD' ? 'Pindaian surat bertanda tangan' : 'Dokumen'} diunggah: ${a.nama} (versi ${a.versi})` });
    }
    await auditFor(r, ctx, 'DOKUMEN_DIUNGGAH', 'letter_out', id, { kategori, berkas: files.map((f) => f.name) });
  });
}

/** Catat pengiriman. Syarat: surat bernomor dan pindaian surat bertanda tangan sudah diunggah. */
async function sendOne(d: Deps, ctx: Ctx, id: number, b: Body) {
  const r0 = d.uow.read;
  const metode = await refValue(r0, 'metode_kirim', b.metode, 'Cara pengiriman');
  const tanggal = dateStr(b.tanggal || today(), 'Tanggal kirim');
  const catatan = str(b.catatan, 'Catatan', { max: 500, required: false });
  await d.uow.run(async (r) => {
    const lo = await lockOut(r, ctx, id);
    if (lo.status !== 'DICATAT') throw conflict(lo.status === 'DIKIRIM' ? 'Pengiriman surat ini sudah dicatat' : 'Surat sudah dibatalkan');
    if (!isOwnerOut(ctx.actor, lo)) throw forbidden();
    if (!lo.nomor_surat) throw invalid('Beri nomor surat dahulu sebelum mencatat pengiriman');
    if ((await r.lettersOut.signedCount(id)) === 0) throw invalid('Unggah pindaian surat yang sudah ditandatangani sebelum mencatat pengiriman');
    await r.lettersOut.markSent(id, metode, tanggal);
    await r.journal.event({ letterInId: lo.letter_in_id, letterOutId: id, userId: ctx.actor.id, tipe: 'kirim', teks: `Surat dikirim melalui ${metode.toLowerCase()} kepada ${lo.tujuan}${catatan ? `. ${catatan}` : ''}` });
    if (lo.letter_in_id) await recomputeStatus(r, lo.letter_in_id);
    await auditFor(r, ctx, 'SURAT_KELUAR_DIKIRIM', 'letter_out', id, { metode, tanggal });
  });
}
export const send = sendOne;
export const sendMany = (d: Deps, ctx: Ctx, b: Body) => runBulk(b.ids, (id) => sendOne(d, ctx, id, b));

export async function cancel(d: Deps, ctx: Ctx, id: number, b: Body) {
  const alasan = str(b.alasan, 'Alasan pembatalan', { max: 500 });
  await d.uow.run(async (r) => {
    const lo = await lockOut(r, ctx, id);
    if (!letterOutAbilities(ctx.actor, lo).batal) throw conflict('Hanya surat yang belum dikirim yang dapat dibatalkan');
    await r.lettersOut.cancel(id, alasan);
    await r.journal.event({ letterInId: lo.letter_in_id, letterOutId: id, userId: ctx.actor.id, tipe: 'surat_keluar', teks: `Surat dibatalkan: ${alasan}` });
    if (lo.letter_in_id) await recomputeStatus(r, lo.letter_in_id);
    await auditFor(r, ctx, 'SURAT_KELUAR_DIBATALKAN', 'letter_out', id, { alasan });
  });
}

export async function comment(d: Deps, ctx: Ctx, id: number, b: Body) {
  const teks = str(b.teks, 'Komentar', { max: 2000 });
  if (is(ctx.actor, 'viewer')) throw forbidden();
  await d.uow.run(async (r) => {
    const lo: LetterOut = await loadLetterOut(r, ctx.actor, id);
    await r.journal.event({ letterInId: lo.letter_in_id, letterOutId: id, userId: ctx.actor.id, tipe: 'komentar', teks });
    const names = mentionedUsernames(teks);
    for (const u of names.length ? await r.users.byUsernames(names) : []) {
      if (await r.lettersOut.isVisibleTo(u, id)) {
        await r.journal.notify([u.id], { tipe: 'komentar', judul: `${ctx.actor.nama} menyebut Anda`, isi: teks.slice(0, 140), link: `/surat-keluar/${id}` }, ctx.actor.id);
      }
    }
    await auditFor(r, ctx, 'KOMENTAR', 'letter_out', id, { panjang: teks.length });
  });
}
