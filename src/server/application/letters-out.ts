import { conflict, forbidden, invalid, notFound } from '@/domain/errors';
import {
  canEditOut, cleanFields, DEFAULT_NUMBERING, formatNomor, isOwnerOut, letterOutAbilities, METODE_KIRIM, missingRequired, outAgenda,
  PLACEHOLDER_NOMOR, STATUS_OUT, withBawaan, type LetterOut, type NumberingConfig, type StatusOut, type TemplateField,
} from '@/domain/letter-out';
import { can, is } from '@/domain/roles';
import { dateStr, int, oneOf, str, today } from '@/domain/validation';
import { auditFor, runBulk, type Ctx, type Deps } from './context';
import type { IncomingFile, LetterOutFilter, Repos } from './ports';
import { loadLetterIn, loadLetterOut, mentionedUsernames, recomputeStatus, saveAttachment } from './shared';

type Body = Record<string, unknown>;
type Draft = Pick<LetterOut, 'fields' | 'perihal' | 'tujuan' | 'tgl_surat' | 'nomor_surat' | 'penandatangan_id'>;

const filterOf = (q: Record<string, string | undefined>): LetterOutFilter => ({
  status: q.status, mine: q.mine === '1', jenis: q.jenis, antrian: q.antrian, q: q.q?.slice(0, 100),
  from: dateStr(q.from, 'Dari tanggal', { required: false }),
  to: dateStr(q.to, 'Sampai tanggal', { required: false }),
});

const label = <T extends { status: string }>(x: T) => ({ ...x, statusLabel: STATUS_OUT[x.status as StatusOut] });

export async function list(d: Deps, ctx: Ctx, q: Record<string, string | undefined>) {
  const page = await d.uow.read.letterOutQueries.list(ctx.actor, filterOf(q), q);
  return { ...page, items: page.items.map(label) };
}
export async function exportRows(d: Deps, ctx: Ctx, q: Record<string, string | undefined>) {
  const rows = await d.uow.read.letterOutQueries.exportRows(ctx.actor, filterOf(q), q);
  return {
    columns: ['No. Agenda', 'Nomor surat', 'Tanggal', 'Jenis', 'Tujuan', 'Perihal', 'Pembuat', 'Status'],
    rows: rows.map((x) => [x.no_agenda, x.nomor_surat, x.tgl_surat, x.jenis, x.tujuan, x.perihal, x.pembuat, STATUS_OUT[x.status as StatusOut]]),
  };
}
export const ids = (d: Deps, ctx: Ctx, q: Record<string, string | undefined>) => d.uow.read.letterOutQueries.ids(ctx.actor, filterOf(q));

/* ---------- Dokumen ---------- */

/** Nilai placeholder: field isian, kolom bawaan, dan field sistem (kop, penandatangan, nomor). */
async function buildValues(d: Deps, r: Repos, lo: Draft, fields: TemplateField[]) {
  const inst = (await r.settings.get<Record<string, string>>('instansi')) || {};
  const signer = lo.penandatangan_id ? await r.users.signer(lo.penandatangan_id) : null;
  const nomor = lo.nomor_surat || PLACEHOLDER_NOMOR;
  return d.documents.formatValues(fields, {
    ...lo.fields,
    perihal: lo.perihal, hal: lo.perihal, nama_penerima: lo.tujuan, kepada: lo.tujuan, tanggal: lo.tgl_surat,
    nomor_surat: nomor, nomor,
    kop_instansi: inst.nama || '', kop_alamat: inst.alamat || '', kota: inst.kota || '',
    penandatangan: signer?.nama || '', penandatangan_nama: signer?.nama || '', penandatangan_jabatan: signer?.jabatan || '',
    penandatangan_nip: signer?.nip || '', penandatangan_pangkat: signer?.pangkat || '',
  });
}

async function renderDraft(d: Deps, r: Repos, lo: Draft, versionId: number) {
  const tv = await r.templates.version(versionId);
  if (!tv) throw notFound('Template tidak ditemukan');
  return d.documents.render(await d.files.read(tv.file_path), await buildValues(d, r, lo, tv.fields));
}

/** Hasilkan DOCX terbaru dan simpan sebagai versi dokumen baru. */
async function storeDoc(d: Deps, r: Repos, lo: LetterOut, userId: number, kategori: 'DRAF' | 'FINAL') {
  const buffer = await renderDraft(d, r, lo, lo.template_version_id);
  const a = await saveAttachment(d, r, {
    buffer, ext: 'docx', kategori, letterOutId: lo.id, userId, nama: `${lo.no_agenda}${kategori === 'FINAL' ? '-final' : ''}.docx`,
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  await r.lettersOut.setDocVersion(lo.id, a.versi);
  return a;
}

function validateDateFields(fields: TemplateField[], values: Record<string, string>) {
  for (const f of fields) if (f.type === 'date' && values[f.name]) dateStr(values[f.name], f.label);
}

/** Pratinjau tanpa menyimpan. */
export async function previewDraft(d: Deps, ctx: Ctx, b: Body) {
  if (!can.writeOut(ctx.actor)) throw forbidden();
  const r = d.uow.read;
  const tv = await r.templates.version(int(b.template_version_id, 'Template'));
  if (!tv) throw notFound('Template tidak ditemukan');
  const lo: Draft = {
    fields: cleanFields(tv.fields, b.fields as Record<string, unknown>), perihal: String(b.perihal || '').slice(0, 500), tujuan: String(b.tujuan || '').slice(0, 500),
    tgl_surat: (b.tgl_surat as string) || today(), nomor_surat: null, penandatangan_id: int(b.penandatangan_id, 'Penandatangan', { required: false }),
  };
  return { html: await d.documents.toHtml(d.documents.render(await d.files.read(tv.file_path), await buildValues(d, r, lo, tv.fields))) };
}

/* ---------- Buat dan ubah ---------- */

export async function create(d: Deps, ctx: Ctx, b: Body) {
  if (!can.writeOut(ctx.actor)) throw forbidden('Peran Anda tidak dapat membuat surat keluar');
  return d.uow.run(async (r) => {
    const tv = await r.templates.versionWithTemplate(int(b.template_version_id, 'Template'));
    if (!tv || !tv.template_aktif) throw invalid('Template tidak tersedia');
    const letterInId = int(b.letter_in_id, 'Surat masuk', { required: false });
    if (letterInId) await loadLetterIn(r, ctx.actor, letterInId);
    const perihal = str(b.perihal, 'Perihal', { max: 500 });
    const tujuan = str(b.tujuan, 'Tujuan', { max: 500 });
    const tgl = dateStr(b.tgl_surat, 'Tanggal surat');
    const signer = int(b.penandatangan_id, 'Penandatangan', { required: false });
    if (signer && !(await r.users.isSigner(signer))) throw invalid('Penandatangan tidak valid');
    const fields = cleanFields(tv.fields, b.fields as Record<string, unknown>);
    validateDateFields(tv.fields, fields);
    const year = tgl.slice(0, 4);
    const no_agenda = outAgenda(year, await r.journal.nextSeq(`SK-${year}`));
    const lo = await r.lettersOut.insert({ no_agenda, letterInId, templateVersionId: tv.id, jenis: tv.jenis, perihal, tujuan, fields, tglSurat: tgl, signerId: signer, createdBy: ctx.actor.id });
    await storeDoc(d, r, lo, ctx.actor.id, 'DRAF');
    await r.journal.event({ letterInId, letterOutId: lo.id, userId: ctx.actor.id, tipe: 'surat_keluar', teks: `Draf ${tv.jenis} dibuat (${no_agenda})` });
    if (letterInId) await recomputeStatus(r, letterInId);
    await auditFor(r, ctx, 'SURAT_KELUAR_DIBUAT', 'letter_out', lo.id, { no_agenda, jenis: tv.jenis, letter_in: letterInId });
    return { id: lo.id, no_agenda };
  });
}

export async function update(d: Deps, ctx: Ctx, id: number, b: Body) {
  await d.uow.run(async (r) => {
    const lo = await loadLetterOut(r, ctx.actor, id);
    if (!canEditOut(ctx.actor, lo)) throw forbidden('Surat tidak dapat diubah pada status ini');
    const tv = await r.templates.version(lo.template_version_id);
    const fields = cleanFields(tv!.fields, b.fields as Record<string, unknown>);
    validateDateFields(tv!.fields, fields);
    const next: LetterOut = {
      ...lo,
      perihal: str(b.perihal, 'Perihal', { max: 500 }),
      tujuan: str(b.tujuan, 'Tujuan', { max: 500 }),
      tgl_surat: dateStr(b.tgl_surat, 'Tanggal surat'),
      penandatangan_id: int(b.penandatangan_id, 'Penandatangan', { required: false }),
      fields,
    };
    await r.lettersOut.updateContent(id, next);
    const a = await storeDoc(d, r, next, ctx.actor.id, 'DRAF');
    await r.journal.event({ letterInId: lo.letter_in_id, letterOutId: id, userId: ctx.actor.id, tipe: 'revisi_dokumen', teks: `Dokumen diperbarui menjadi versi ${a.versi}` });
    await auditFor(r, ctx, 'SURAT_KELUAR_DIUBAH', 'letter_out', id, { versi: a.versi });
  });
}

/* ---------- Detail ---------- */

export async function detail(d: Deps, ctx: Ctx, id: number) {
  const r = d.uow.read;
  const lo = await loadLetterOut(r, ctx.actor, id);
  const hideFiles = is(ctx.actor, 'viewer') && !['DIKIRIM', 'SELESAI'].includes(lo.status);
  const [tv, creator, signer, approvals, attachments, asal] = await Promise.all([
    r.templates.versionWithTemplate(lo.template_version_id),
    r.users.name(lo.created_by),
    lo.penandatangan_id ? r.users.signer(lo.penandatangan_id) : Promise.resolve(null),
    r.lettersOut.approvals(id),
    hideFiles ? Promise.resolve([]) : r.attachments.forLetterOut(id),
    lo.letter_in_id ? r.lettersIn.summary(lo.letter_in_id) : Promise.resolve(null),
  ]);
  return {
    letter: { ...lo, statusLabel: STATUS_OUT[lo.status], pembuat: creator },
    template: { id: tv!.template_id, nama: tv!.template_nama, versi: tv!.versi, fields: withBawaan(tv!.fields) },
    signer: signer && { id: lo.penandatangan_id, nama: signer.nama, jabatan: signer.jabatan },
    approvals, attachments, asal, can: letterOutAbilities(ctx.actor, lo), kurang: missingRequired(tv!.fields, lo.fields),
  };
}

export async function timeline(d: Deps, ctx: Ctx, id: number) {
  await loadLetterOut(d.uow.read, ctx.actor, id);
  return d.uow.read.lettersOut.timeline(id);
}

export async function preview(d: Deps, ctx: Ctx, id: number) {
  const lo = await loadLetterOut(d.uow.read, ctx.actor, id);
  return { html: await d.documents.toHtml(await renderDraft(d, d.uow.read, lo, lo.template_version_id)) };
}

export async function download(d: Deps, ctx: Ctx, id: number, format: unknown) {
  const r = d.uow.read;
  const lo = await loadLetterOut(r, ctx.actor, id);
  const fmt = oneOf(format || 'docx', ['docx', 'pdf'] as const, 'Format');
  if (is(ctx.actor, 'viewer') && !['DIKIRIM', 'SELESAI'].includes(lo.status)) throw forbidden();
  let buf = await renderDraft(d, r, lo, lo.template_version_id);
  if (fmt === 'pdf') buf = await d.documents.toPdf(buf);
  await d.uow.run((w) => auditFor(w, ctx, 'SURAT_KELUAR_DIUNDUH', 'letter_out', lo.id, { format: fmt }));
  return {
    body: buf,
    filename: `${(lo.nomor_surat || lo.no_agenda).replace(/[^A-Za-z0-9._-]+/g, '_')}.${fmt}`,
    mime: fmt === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
}

/* ---------- Alur persetujuan ---------- */

interface Step { status: StatusOut; aksi: string; catatan: string | null; teks: string; notifyIds?: number[]; notifJudul?: string }

async function step(r: Repos, ctx: Ctx, lo: LetterOut, s: Step) {
  await r.lettersOut.setStatus(lo.id, s.status);
  await r.lettersOut.addApproval(lo.id, ctx.actor.id, s.aksi, s.catatan);
  await r.journal.event({ letterInId: lo.letter_in_id, letterOutId: lo.id, userId: ctx.actor.id, tipe: 'approval', teks: s.catatan ? `${s.teks}. Catatan: ${s.catatan}` : s.teks });
  if (s.notifJudul) await r.journal.notify(s.notifyIds || [], { tipe: 'approval', judul: s.notifJudul, isi: `${lo.no_agenda}: ${lo.perihal}`, link: `/surat-keluar/${lo.id}` }, ctx.actor.id);
  if (lo.letter_in_id) await recomputeStatus(r, lo.letter_in_id);
  await auditFor(r, ctx, `SURAT_KELUAR_${s.aksi}`, 'letter_out', lo.id, { status: s.status, catatan: s.catatan });
}

async function lockOut(r: Repos, ctx: Ctx, id: number) {
  await loadLetterOut(r, ctx.actor, id);
  return (await r.lettersOut.lock(id))!;
}

export async function requestReview(d: Deps, ctx: Ctx, id: number, b: Body) {
  await d.uow.run(async (r) => {
    const lo = await lockOut(r, ctx, id);
    if (!['DRAFT', 'REVISI'].includes(lo.status)) throw conflict('Surat tidak dalam status draf atau perlu diperbaiki');
    if (!isOwnerOut(ctx.actor, lo)) throw forbidden();
    await step(r, ctx, lo, {
      status: 'REVIEW', aksi: 'AJUKAN_REVIEW', catatan: str(b.catatan, 'Catatan', { max: 1000, required: false }), teks: 'Diajukan untuk diperiksa',
      notifyIds: await r.users.activeIdsByRole(['pejabat', 'pimpinan']), notifJudul: 'Surat keluar menunggu pemeriksaan',
    });
  });
}

export async function review(d: Deps, ctx: Ctx, id: number, b: Body) {
  const aksi = oneOf(b.aksi, ['lanjut', 'revisi'] as const, 'Hasil pemeriksaan');
  const catatan = aksi === 'revisi' ? str(b.catatan, 'Catatan', { max: 1000 }) : str(b.catatan, 'Catatan', { max: 1000, required: false });
  await d.uow.run(async (r) => {
    const lo = await lockOut(r, ctx, id);
    if (lo.status !== 'REVIEW') throw conflict('Surat tidak sedang diperiksa');
    if (!can.review(ctx.actor)) throw forbidden();
    if (aksi === 'lanjut') await step(r, ctx, lo, { status: 'MENUNGGU_PERSETUJUAN', aksi: 'REVIEW_LANJUT', catatan, teks: 'Pemeriksaan selesai, diajukan untuk persetujuan', notifyIds: await r.users.activeIdsByRole(['pimpinan']), notifJudul: 'Surat keluar menunggu persetujuan Anda' });
    else await step(r, ctx, lo, { status: 'REVISI', aksi: 'REVIEW_REVISI', catatan, teks: 'Dikembalikan untuk diperbaiki', notifyIds: [lo.created_by], notifJudul: 'Surat keluar perlu diperbaiki' });
  });
}

async function submitOne(d: Deps, ctx: Ctx, id: number, b: Body = {}) {
  await d.uow.run(async (r) => {
    const lo = await lockOut(r, ctx, id);
    if (!['DRAFT', 'REVISI', 'REVIEW'].includes(lo.status)) throw conflict('Surat tidak dapat diajukan pada status ini');
    if (lo.status === 'REVIEW' ? !can.review(ctx.actor) : !isOwnerOut(ctx.actor, lo)) throw forbidden();
    const tv = await r.templates.version(lo.template_version_id);
    const kurang = missingRequired(tv!.fields, lo.fields);
    if (kurang.length) throw invalid(`Lengkapi isian berikut sebelum diajukan: ${kurang.join(', ')}`);
    if (!lo.penandatangan_id) throw invalid('Pilih penandatangan sebelum diajukan');
    await step(r, ctx, lo, { status: 'MENUNGGU_PERSETUJUAN', aksi: 'AJUKAN', catatan: str(b.catatan, 'Catatan', { max: 1000, required: false }), teks: 'Diajukan untuk persetujuan', notifyIds: await r.users.activeIdsByRole(['pimpinan']), notifJudul: 'Surat keluar menunggu persetujuan Anda' });
  });
}
export const submit = submitOne;
export const submitMany = (d: Deps, ctx: Ctx, ids: unknown) => runBulk(ids, (id) => submitOne(d, ctx, id));

/** Penomoran otomatis: urutan atomik per tahun, nomor unik di tingkat database. */
async function assignNomor(r: Repos, lo: LetterOut) {
  const kode = await r.templates.classificationCode(lo.template_version_id);
  const cfg = (await r.settings.get<NumberingConfig>('penomoran')) || DEFAULT_NUMBERING;
  const inst = (await r.settings.get<Record<string, string>>('instansi')) || {};
  const urut = await r.journal.nextSeq(`NO-${lo.tgl_surat.slice(0, 4)}`);
  return formatNomor(cfg, { kode, urut, unit: inst.kode_unit || '', tglSurat: lo.tgl_surat });
}

async function decideOne(d: Deps, ctx: Ctx, id: number, b: Body) {
  const aksi = oneOf(b.aksi, ['setuju', 'tolak', 'revisi'] as const, 'Keputusan');
  const catatan = aksi === 'setuju' ? str(b.catatan, 'Catatan', { max: 1000, required: false }) : str(b.catatan, 'Catatan', { max: 1000 });
  await d.uow.run(async (r) => {
    const lo = await lockOut(r, ctx, id);
    if (lo.status !== 'MENUNGGU_PERSETUJUAN') throw conflict('Surat tidak sedang menunggu persetujuan');
    if (!can.approve(ctx.actor)) throw forbidden('Hanya pimpinan yang dapat memutuskan persetujuan');
    if (aksi === 'tolak') return step(r, ctx, lo, { status: 'DITOLAK', aksi: 'TOLAK', catatan, teks: 'Surat ditolak', notifyIds: [lo.created_by], notifJudul: 'Surat keluar ditolak' });
    if (aksi === 'revisi') return step(r, ctx, lo, { status: 'REVISI', aksi: 'REVISI', catatan, teks: 'Dikembalikan untuk diperbaiki', notifyIds: [lo.created_by], notifJudul: 'Surat keluar perlu diperbaiki' });
    const nomor = await assignNomor(r, lo);
    await r.lettersOut.setNomor(lo.id, nomor);
    const withNo = { ...lo, nomor_surat: nomor };
    await storeDoc(d, r, withNo, ctx.actor.id, 'FINAL');
    return step(r, ctx, withNo, { status: 'NOMOR_DIBERIKAN', aksi: 'SETUJU', catatan, teks: `Disetujui, nomor surat ${nomor} diberikan`, notifyIds: [lo.created_by, ...(await r.users.activeIdsByRole(['tu']))], notifJudul: 'Surat keluar disetujui' });
  });
}
export const decide = decideOne;
export const decideMany = (d: Deps, ctx: Ctx, b: Body) => runBulk(b.ids, (id) => decideOne(d, ctx, id, b));

export async function uploadSigned(d: Deps, ctx: Ctx, id: number, file: IncomingFile | null) {
  if (!file) throw invalid('Unggah dokumen yang sudah ditandatangani (PDF)');
  if (!file.name.toLowerCase().endsWith('.pdf')) throw invalid('Dokumen bertanda tangan harus berformat PDF');
  d.files.validate(file);
  await d.uow.run(async (r) => {
    const lo = await lockOut(r, ctx, id);
    if (lo.status !== 'NOMOR_DIBERIKAN') throw conflict('Surat belum bernomor atau sudah ditandatangani');
    if (!(is(ctx.actor, 'superadmin', 'tu') || lo.created_by === ctx.actor.id)) throw forbidden();
    const a = await saveAttachment(d, r, { file, kategori: 'TTD', letterOutId: lo.id, userId: ctx.actor.id, nama: `${lo.no_agenda}-ttd.pdf` });
    await step(r, ctx, lo, { status: 'DITANDATANGANI', aksi: 'TTD', catatan: null, teks: `Dokumen bertanda tangan diunggah (versi ${a.versi})` });
  });
}

export async function send(d: Deps, ctx: Ctx, id: number, b: Body) {
  const metode = oneOf(b.metode, METODE_KIRIM, 'Cara pengiriman');
  const catatan = str(b.catatan, 'Catatan', { max: 500, required: false });
  await d.uow.run(async (r) => {
    const lo = await lockOut(r, ctx, id);
    if (lo.status !== 'DITANDATANGANI') throw conflict('Surat harus ditandatangani sebelum dikirim');
    if (!is(ctx.actor, 'superadmin', 'tu')) throw forbidden();
    await r.lettersOut.markSent(lo.id, metode);
    await step(r, ctx, lo, { status: 'DIKIRIM', aksi: 'KIRIM', catatan, teks: `Surat dikirim melalui ${metode.toLowerCase()} kepada ${lo.tujuan}` });
  });
}

export async function complete(d: Deps, ctx: Ctx, id: number) {
  await d.uow.run(async (r) => {
    const lo = await lockOut(r, ctx, id);
    if (lo.status !== 'DIKIRIM') throw conflict('Surat belum dikirim');
    if (!is(ctx.actor, 'superadmin', 'tu')) throw forbidden();
    await step(r, ctx, lo, { status: 'SELESAI', aksi: 'SELESAI', catatan: null, teks: 'Surat keluar selesai' });
  });
}

export async function uploadDocuments(d: Deps, ctx: Ctx, id: number, files: IncomingFile[]) {
  if (!files.length) throw invalid('Pilih file yang akan diunggah');
  for (const f of files) d.files.validate(f);
  await d.uow.run(async (r) => {
    const lo = await lockOut(r, ctx, id);
    if (is(ctx.actor, 'viewer')) throw forbidden();
    if (['SELESAI', 'DITOLAK'].includes(lo.status)) throw conflict('Surat sudah ditutup');
    for (const f of files) {
      const a = await saveAttachment(d, r, { file: f, kategori: 'PENDUKUNG', letterOutId: id, userId: ctx.actor.id });
      await r.journal.event({ letterInId: lo.letter_in_id, letterOutId: id, userId: ctx.actor.id, tipe: 'dokumen', teks: `Dokumen diunggah: ${a.nama} (versi ${a.versi})` });
    }
    await auditFor(r, ctx, 'DOKUMEN_DIUNGGAH', 'letter_out', id, { berkas: files.map((f) => f.name) });
  });
}

export async function comment(d: Deps, ctx: Ctx, id: number, b: Body) {
  const teks = str(b.teks, 'Komentar', { max: 2000 });
  if (is(ctx.actor, 'viewer')) throw forbidden();
  await d.uow.run(async (r) => {
    const lo = await loadLetterOut(r, ctx.actor, id);
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
