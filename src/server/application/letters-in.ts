import { conflict, forbidden, invalid, notFound } from '@/domain/errors';
import {
  agendaNumbers, completionChecks, effectiveDeadline, holdsDisposition, indicatorFor, isFinished, KATEGORI_IN, letterInAbilities,
  METODE, PRIORITAS, PRIORITAS_DISPOSISI, SIFAT, STATUS_IN, stagesFor, TINDAKAN,
} from '@/domain/letter-in';
import { can, is } from '@/domain/roles';
import { DEFAULT_SLA, slaDue, type SlaConfig } from '@/domain/sla';
import { formatTrackCode, newTrackCode } from '@/domain/tracking';
import { dateStr, int, oneOf, str, today } from '@/domain/validation';
import { auditFor, runBulk, type Ctx, type Deps } from './context';
import type { IncomingFile, LetterInFilter, Repos } from './ports';
import { loadLetterIn, mentionedUsernames, recomputeStatus, saveAttachment } from './shared';

type Body = Record<string, unknown>;

const slaConfig = async (r: Repos) => (await r.settings.get<SlaConfig>('sla')) || DEFAULT_SLA;

/* ---------- Daftar ---------- */

export function parseLetterInFilter(q: Record<string, string | undefined>): LetterInFilter {
  return {
    status: q.status, sifat: q.sifat, prioritas: q.prioritas, q: q.q?.slice(0, 100),
    from: dateStr(q.from, 'Dari tanggal', { required: false }),
    to: dateStr(q.to, 'Sampai tanggal', { required: false }),
    unit: int(q.unit, 'Unit', { required: false }),
    pic: int(q.pic, 'PIC', { required: false }),
    antrian: q.antrian,
  };
}

const decorate = <T extends { status: string; sla_due: string | null; deadlines?: (string | null)[] | null }>(l: T) => {
  const deadline = effectiveDeadline(l, l.deadlines || []);
  const { deadlines: _drop, ...rest } = l;
  return { ...rest, statusLabel: STATUS_IN[l.status as keyof typeof STATUS_IN], deadline, sla: indicatorFor(l as never, deadline) };
};

export async function list(d: Deps, ctx: Ctx, q: Record<string, string | undefined>) {
  const page = await d.uow.read.lettersInQueries.list(ctx.actor, parseLetterInFilter(q), q);
  return { ...page, items: page.items.map(decorate) };
}

export async function exportRows(d: Deps, ctx: Ctx, q: Record<string, string | undefined>) {
  const rows = (await d.uow.read.lettersInQueries.exportRows(ctx.actor, parseLetterInFilter(q), q)).map(decorate);
  return {
    columns: ['No. Agenda', 'No. Surat', 'Tanggal surat', 'Tanggal diterima', 'Asal', 'Instansi', 'Perihal', 'Sifat', 'Prioritas', 'Status', 'Posisi', 'Tenggat'],
    rows: rows.map((l) => [l.no_agenda, l.no_surat, l.tgl_surat, l.tgl_diterima, l.asal, l.instansi, l.perihal, l.sifat, l.prioritas, l.statusLabel, l.pic, l.deadline]),
  };
}

export const ids = (d: Deps, ctx: Ctx, q: Record<string, string | undefined>) => d.uow.read.lettersInQueries.ids(ctx.actor, parseLetterInFilter(q));

/* ---------- Catat surat masuk ---------- */

function letterBody(b: Body, { creating }: { creating: boolean }) {
  return {
    no_surat: str(b.no_surat, 'Nomor surat', { max: 120 }),
    tgl_surat: dateStr(b.tgl_surat, 'Tanggal surat'),
    asal: str(b.asal, 'Asal surat', { max: 200 }),
    instansi: str(b.instansi, 'Instansi', { max: 200, required: false }),
    alamat: str(b.alamat, 'Alamat pengirim', { max: 400, required: false }),
    perihal: str(b.perihal, 'Perihal', { max: 500 }),
    sifat: oneOf(b.sifat || (creating ? 'Biasa' : ''), SIFAT, 'Sifat surat'),
    prioritas: oneOf(b.prioritas || (creating ? 'Normal' : ''), PRIORITAS, 'Prioritas'),
    lampiran: str(b.lampiran, 'Lampiran', { max: 200, required: false }),
    catatan: str(b.catatan, creating ? 'Catatan penerimaan' : 'Catatan', { max: 1000, required: false }),
  };
}

export async function create(d: Deps, ctx: Ctx, b: Body, files: IncomingFile[]) {
  if (!can.manageIn(ctx.actor)) throw forbidden();
  const data = {
    ...letterBody(b, { creating: true }),
    tgl_diterima: dateStr(b.tgl_diterima, 'Tanggal diterima'),
    jenis: str(b.jenis, 'Jenis surat', { max: 60, required: false }) || 'Surat Dinas',
  };
  if (data.tgl_diterima < data.tgl_surat) throw invalid('Tanggal diterima tidak boleh sebelum tanggal surat');
  for (const f of files) d.files.validate(f);
  return d.uow.run(async (r) => {
    const year = data.tgl_diterima.slice(0, 4);
    const nums = agendaNumbers(year, await r.journal.nextSeq(`SM-${year}`));
    const li = await r.lettersIn.insert({
      ...data, ...nums,
      sla_due: slaDue(await slaConfig(r), data.prioritas, data.tgl_diterima),
      qr_token: d.tokens.create(12),
      created_by: ctx.actor.id,
      track_code: newTrackCode(),
      track_enabled: data.sifat !== 'Rahasia',
    });
    for (const f of files) await saveAttachment(d, r, { file: f, kategori: 'SURAT', letterInId: li.id, userId: ctx.actor.id });
    await r.journal.event({ letterInId: li.id, userId: ctx.actor.id, tipe: 'diterima', teks: `Surat diterima dan dicatat dengan nomor agenda ${nums.no_agenda}` });
    await auditFor(r, ctx, 'SURAT_MASUK_DIBUAT', 'letter_in', li.id, { no_agenda: nums.no_agenda, perihal: data.perihal, berkas: files.length });
    return li;
  });
}

export async function update(d: Deps, ctx: Ctx, id: number, b: Body) {
  if (!can.manageIn(ctx.actor)) throw forbidden();
  await d.uow.run(async (r) => {
    const li = await loadLetterIn(r, ctx.actor, id);
    if (!['DITERIMA', 'MENUNGGU_DISPOSISI'].includes(li.status)) throw conflict('Data surat tidak dapat diubah setelah didisposisikan');
    const data = letterBody(b, { creating: false });
    await r.lettersIn.updateMeta(id, { ...data, sla_due: slaDue(await slaConfig(r), data.prioritas, li.tgl_diterima) });
    await r.journal.event({ letterInId: id, userId: ctx.actor.id, tipe: 'ubah', teks: 'Data surat diperbarui' });
    await auditFor(r, ctx, 'SURAT_MASUK_DIUBAH', 'letter_in', id, data);
  });
}

/* ---------- Detail ---------- */

export async function detail(d: Deps, ctx: Ctx, id: number) {
  const r = d.uow.read;
  const li = await loadLetterIn(r, ctx.actor, id);
  const [dispositions, tasks, attachments, confirmations, outs, creator, counts, facts] = await Promise.all([
    r.dispositions.forLetter(id),
    r.tasks.forLetter(id),
    is(ctx.actor, 'viewer') ? Promise.resolve([]) : r.attachments.forLetterIn(id),
    r.confirmations.forLetter(id),
    r.lettersOut.forLetterIn(id),
    r.users.name(li.created_by),
    r.lettersIn.stageCounts(id),
    r.lettersIn.completionFacts(id),
  ]);
  const { stages, percent } = stagesFor(li, counts);
  const syarat = completionChecks(facts.tasks, facts.outs, facts.confirmations);
  const deadline = effectiveDeadline(li, dispositions.filter((x) => ['BARU', 'DITERIMA'].includes(x.status)).map((x) => x.deadline));
  const holds = dispositions.filter((x) => holdsDisposition(ctx.actor, x));
  const { track_code: _t, qr_token: _q, ...letter } = li;
  return {
    letter: { ...letter, creator_nama: creator, statusLabel: STATUS_IN[li.status] },
    dispositions, tasks, attachments, confirmations, outs, stages, percent, syarat,
    deadline, sla: indicatorFor(li, deadline), can: letterInAbilities(ctx.actor, li, holds, tasks),
    holds: holds.map((x) => x.id),
  };
}

export async function timeline(d: Deps, ctx: Ctx, id: number) {
  await loadLetterIn(d.uow.read, ctx.actor, id);
  return d.uow.read.lettersIn.timeline(id);
}

const statusUrl = (ctx: Ctx, token: string) => `${ctx.baseUrl}/s/${token}`;

export async function qr(d: Deps, ctx: Ctx, id: number) {
  const li = await loadLetterIn(d.uow.read, ctx.actor, id);
  const url = statusUrl(ctx, li.qr_token);
  return { url, dataUrl: await d.qr.toDataUrl(url, 240) };
}

export async function resolveQr(d: Deps, token: string) {
  const id = await d.uow.read.lettersIn.idByQrToken(token.slice(0, 64));
  if (!id) throw notFound('Kode surat tidak dikenal');
  return { id };
}

/* ---------- Teruskan ke pimpinan ---------- */

async function forwardOne(d: Deps, ctx: Ctx, id: number) {
  if (!can.manageIn(ctx.actor)) throw forbidden();
  await d.uow.run(async (r) => {
    const li = await loadLetterIn(r, ctx.actor, id);
    if (li.status !== 'DITERIMA') throw conflict('Surat sudah diteruskan');
    await r.lettersIn.markForwarded(id);
    await r.journal.event({ letterInId: id, userId: ctx.actor.id, tipe: 'diteruskan', teks: 'Diteruskan kepada pimpinan, menunggu disposisi' });
    await r.journal.notify(await r.users.activeIdsByRole(['pimpinan']), { tipe: 'disposisi', judul: 'Surat menunggu disposisi Anda', isi: `${li.no_agenda}: ${li.perihal}`, link: `/surat-masuk/${id}` });
    await auditFor(r, ctx, 'SURAT_DITERUSKAN', 'letter_in', id);
  });
}
export const forward = forwardOne;
export const forwardMany = (d: Deps, ctx: Ctx, ids: unknown) => {
  if (!can.manageIn(ctx.actor)) throw forbidden();
  return runBulk(ids, (id) => forwardOne(d, ctx, id));
};

/* ---------- Disposisi ---------- */

async function disposeOne(d: Deps, ctx: Ctx, id: number, b: Body) {
  const toUsers = (Array.isArray(b.to_user_ids) ? b.to_user_ids : []).map((x) => int(x, 'Penerima'));
  const toUnits = (Array.isArray(b.to_unit_ids) ? b.to_unit_ids : []).map((x) => int(x, 'Unit'));
  if (toUsers.length + toUnits.length === 0) throw invalid('Pilih minimal satu penerima disposisi');
  const tindakan = (Array.isArray(b.tindakan) ? b.tindakan : []).filter((t): t is string => (TINDAKAN as readonly string[]).includes(t));
  if (tindakan.length === 0) throw invalid('Pilih minimal satu tindakan');
  const instruksi = str(b.instruksi, 'Instruksi', { max: 1500 });
  const deadline = dateStr(b.deadline, 'Batas waktu');
  const prioritas = oneOf(b.prioritas || 'Normal', PRIORITAS_DISPOSISI, 'Prioritas');
  const parentId = int(b.parent_id, 'Disposisi induk', { required: false });
  await d.uow.run(async (r) => {
    const li = await loadLetterIn(r, ctx.actor, id);
    if (isFinished(li.status)) throw conflict('Surat sudah selesai');
    if (deadline < today()) throw invalid('Batas waktu tidak boleh sebelum hari ini');
    const parent = parentId ? await r.dispositions.lockInLetter(parentId, id) : null;
    if (parentId && !parent) throw notFound('Disposisi induk tidak ditemukan');
    const may = can.dispose(ctx.actor) || (parent && holdsDisposition(ctx.actor, parent) && is(ctx.actor, 'pejabat'));
    if (!may) throw forbidden('Hanya pimpinan atau pejabat penerima disposisi yang dapat meneruskan');
    for (const uid of toUsers) if (!(await r.users.isActive(uid))) throw invalid('Penerima tidak valid');
    for (const un of toUnits) if (!(await r.units.isActive(un))) throw invalid('Unit tidak valid');
    const created: number[] = [];
    const targets = [...toUsers.map((u) => ({ u, n: null })), ...toUnits.map((n) => ({ u: null, n }))];
    for (const t of targets) {
      const dispId = await r.dispositions.insert({ letterInId: id, parentId, fromUserId: ctx.actor.id, toUserId: t.u, toUnitId: t.n, tindakan, instruksi, deadline, prioritas });
      created.push(dispId);
      const label = t.u ? await r.users.name(t.u) : await r.units.name(t.n!);
      const recipients = t.u ? [t.u] : await r.users.unitRecipients(t.n!);
      await r.journal.notify(recipients, { tipe: 'disposisi', judul: 'Anda menerima disposisi baru', isi: `${li.no_agenda}: ${li.perihal}. Batas waktu ${deadline}`, link: `/surat-masuk/${id}` }, ctx.actor.id);
      await r.journal.event({ letterInId: id, userId: ctx.actor.id, tipe: parentId ? 'forward' : 'disposisi', teks: `${parentId ? 'Disposisi diteruskan' : 'Disposisi diberikan'} kepada ${label}`, meta: { disposition_id: dispId, tindakan, deadline } });
    }
    if (parent) await r.dispositions.markForwarded(parent.id);
    await r.lettersIn.markDisposed(id, li.status);
    await recomputeStatus(r, id);
    await auditFor(r, ctx, parentId ? 'DISPOSISI_DITERUSKAN' : 'DISPOSISI_DIBERIKAN', 'letter_in', id, { disposisi: created, tindakan, deadline });
  });
}
export const dispose = disposeOne;
export const disposeMany = (d: Deps, ctx: Ctx, b: Body) => {
  if (!can.dispose(ctx.actor)) throw forbidden('Hanya pimpinan yang dapat memberi disposisi untuk banyak surat');
  return runBulk(b.ids, (id) => disposeOne(d, ctx, id, b));
};

/* ---------- Tugas ---------- */

export async function assignTask(d: Deps, ctx: Ctx, id: number, b: Body) {
  const judul = str(b.judul, 'Judul tugas', { max: 200 });
  const deskripsi = str(b.deskripsi, 'Deskripsi', { max: 2000, required: false });
  const pic = int(b.pic_user_id, 'Penanggung jawab');
  const deadline = dateStr(b.deadline, 'Batas waktu');
  const start = dateStr(b.start_date, 'Tanggal mulai', { required: false }) || today();
  const prioritas = oneOf(b.prioritas || 'Normal', PRIORITAS, 'Prioritas');
  const dispId = int(b.disposition_id, 'Disposisi', { required: false });
  const checklist = (Array.isArray(b.checklist) ? b.checklist : []).map((t) => String(t).trim()).filter(Boolean).slice(0, 30).map((teks) => ({ teks: teks.slice(0, 200), selesai: false }));
  if (deadline < start) throw invalid('Batas waktu tidak boleh sebelum tanggal mulai');
  return d.uow.run(async (r) => {
    const li = await loadLetterIn(r, ctx.actor, id);
    if (isFinished(li.status)) throw conflict('Surat sudah selesai');
    const ds = await r.dispositions.rawForLetter(id);
    const holds = ds.some((x) => holdsDisposition(ctx.actor, x));
    if (!(is(ctx.actor, 'superadmin', 'pimpinan') || (is(ctx.actor, 'pejabat') && holds))) throw forbidden('Hanya pimpinan atau pejabat penerima disposisi yang dapat menugaskan');
    if (!(await r.users.isActive(pic))) throw invalid('Penanggung jawab tidak valid');
    if (dispId && !ds.some((x) => x.id === dispId)) throw invalid('Disposisi tidak terkait surat ini');
    const taskId = await r.tasks.insert({ letterInId: id, dispositionId: dispId, judul, deskripsi, picUserId: pic, assignerId: ctx.actor.id, startDate: start, deadline, prioritas, checklist });
    // Penugas yang memegang disposisi langsung otomatis dianggap sudah menerimanya.
    await r.dispositions.acceptHeldBy(id, ctx.actor.id);
    await r.journal.notify([pic], { tipe: 'tugas', judul: 'Anda menerima tugas baru', isi: `${judul} (${li.no_agenda}). Batas waktu ${deadline}`, link: `/tugas/${taskId}` }, ctx.actor.id);
    await r.journal.event({ letterInId: id, userId: ctx.actor.id, tipe: 'tugas', teks: `Tugas "${judul}" diberikan kepada ${await r.users.name(pic)}`, meta: { task_id: taskId, deadline } });
    await recomputeStatus(r, id);
    await auditFor(r, ctx, 'TUGAS_DIBUAT', 'task', taskId, { letter: id, pic, deadline });
    return { id: taskId };
  });
}

/* ---------- Dokumen ---------- */

export async function uploadDocuments(d: Deps, ctx: Ctx, id: number, b: Body, files: IncomingFile[]) {
  const allowed = KATEGORI_IN.filter((k) => !['SURAT', 'DISPOSISI'].includes(k) || can.manageIn(ctx.actor));
  const kategori = oneOf(b.kategori || 'PENDUKUNG', allowed, 'Kategori');
  if (files.length === 0) throw invalid('Pilih file yang akan diunggah');
  for (const f of files) d.files.validate(f);
  const taskId = int(b.task_id, 'Tugas', { required: false });
  return d.uow.run(async (r) => {
    const li = await loadLetterIn(r, ctx.actor, id);
    if (is(ctx.actor, 'viewer')) throw forbidden();
    if (li.status === 'DIARSIPKAN') throw conflict('Surat sudah diarsipkan');
    const saved = [];
    for (const f of files) {
      const a = await saveAttachment(d, r, { file: f, kategori, letterInId: id, taskId, userId: ctx.actor.id });
      saved.push(a);
      await r.journal.event({ letterInId: id, userId: ctx.actor.id, tipe: 'dokumen', teks: `Dokumen diunggah: ${a.nama} (versi ${a.versi})`, meta: { attachment_id: a.id, kategori } });
    }
    await auditFor(r, ctx, 'DOKUMEN_DIUNGGAH', 'letter_in', id, { berkas: saved.map((s) => s.nama), kategori });
    return saved;
  });
}

/* ---------- Komentar ---------- */

export async function comment(d: Deps, ctx: Ctx, id: number, b: Body) {
  const teks = str(b.teks, 'Komentar', { max: 2000 });
  if (is(ctx.actor, 'viewer')) throw forbidden();
  await d.uow.run(async (r) => {
    const li = await loadLetterIn(r, ctx.actor, id);
    await r.journal.event({ letterInId: id, userId: ctx.actor.id, tipe: 'komentar', teks });
    const names = mentionedUsernames(teks);
    for (const u of names.length ? await r.users.byUsernames(names) : []) {
      // Hanya yang memang boleh melihat surat ini yang diberi tahu.
      if (await r.lettersIn.isVisibleTo(u, id)) {
        await r.journal.notify([u.id], { tipe: 'komentar', judul: `${ctx.actor.nama} menyebut Anda`, isi: teks.slice(0, 140), link: `/surat-masuk/${id}` }, ctx.actor.id);
      }
    }
    await auditFor(r, ctx, 'KOMENTAR', 'letter_in', id, { panjang: teks.length, no_agenda: li.no_agenda });
  });
}

/* ---------- Konfirmasi ke pengirim ---------- */

export async function confirm(d: Deps, ctx: Ctx, id: number, b: Body, bukti: IncomingFile | null) {
  const data = {
    tanggal: dateStr(b.tanggal, 'Tanggal konfirmasi'),
    metode: oneOf(b.metode, METODE, 'Metode'),
    pihak: str(b.pihak, 'Pihak yang dikonfirmasi', { max: 200 }),
    hasil: str(b.hasil, 'Hasil konfirmasi', { max: 1500 }),
    catatan: str(b.catatan, 'Catatan', { max: 1000, required: false }),
  };
  if (bukti) d.files.validate(bukti);
  return d.uow.run(async (r) => {
    const li = await loadLetterIn(r, ctx.actor, id);
    if (isFinished(li.status)) throw conflict('Surat sudah selesai');
    if (is(ctx.actor, 'viewer')) throw forbidden();
    if (is(ctx.actor, 'pelaksana') && !(await r.tasks.hasPic(id, ctx.actor.id))) throw forbidden('Hanya pelaksana yang memegang tugas pada surat ini yang dapat mencatat konfirmasi');
    const attId = bukti ? (await saveAttachment(d, r, { file: bukti, kategori: 'BUKTI', letterInId: id, userId: ctx.actor.id })).id : null;
    const cid = await r.confirmations.insert({ letterInId: id, ...data, buktiAttachmentId: attId, userId: ctx.actor.id });
    await r.journal.event({ letterInId: id, userId: ctx.actor.id, tipe: 'konfirmasi', teks: `Konfirmasi kepada ${data.pihak} melalui ${data.metode.toLowerCase()}: ${data.hasil}` });
    await auditFor(r, ctx, 'KONFIRMASI_DICATAT', 'letter_in', id, data);
    return { id: cid };
  });
}

/* ---------- Selesai dan arsip ---------- */

export async function finish(d: Deps, ctx: Ctx, id: number) {
  if (!is(ctx.actor, 'superadmin', 'tu', 'pimpinan', 'pejabat')) throw forbidden();
  await d.uow.run(async (r) => {
    const li = await loadLetterIn(r, ctx.actor, id);
    if (isFinished(li.status)) throw conflict('Surat sudah selesai');
    const f = await r.lettersIn.completionFacts(id);
    const s = completionChecks(f.tasks, f.outs, f.confirmations);
    if (!s.ok) throw invalid(`Syarat penyelesaian belum terpenuhi: ${s.checks.filter((c) => !c.ok).map((c) => c.label).join('; ')}`);
    await r.lettersIn.finish(id);
    await r.dispositions.finishForLetter(id);
    await r.journal.event({ letterInId: id, userId: ctx.actor.id, tipe: 'selesai', teks: 'Seluruh tindak lanjut dinyatakan selesai' });
    await r.journal.notify(await r.lettersIn.participants(id), { tipe: 'selesai', judul: 'Surat dinyatakan selesai', isi: `${li.no_agenda}: ${li.perihal}`, link: `/surat-masuk/${id}` }, ctx.actor.id);
    await auditFor(r, ctx, 'SURAT_SELESAI', 'letter_in', id);
  });
}

async function archiveOne(d: Deps, ctx: Ctx, id: number) {
  if (!can.manageIn(ctx.actor)) throw forbidden();
  await d.uow.run(async (r) => {
    const li = await loadLetterIn(r, ctx.actor, id);
    if (li.status !== 'SELESAI') throw conflict('Hanya surat berstatus selesai yang dapat diarsipkan');
    await r.lettersIn.archive(id);
    await r.journal.event({ letterInId: id, userId: ctx.actor.id, tipe: 'arsip', teks: 'Surat diarsipkan' });
    await auditFor(r, ctx, 'SURAT_DIARSIPKAN', 'letter_in', id);
  });
}
export const archive = archiveOne;
export const archiveMany = (d: Deps, ctx: Ctx, ids: unknown) => {
  if (!can.manageIn(ctx.actor)) throw forbidden();
  return runBulk(ids, (id) => archiveOne(d, ctx, id));
};

/* ---------- Pelacakan oleh pengirim ---------- */

const trackingView = (ctx: Ctx, li: { track_code: string; track_enabled: boolean; sifat: string }) => ({
  kode: formatTrackCode(li.track_code), url: `${ctx.baseUrl}/lacak/${li.track_code}`, aktif: li.track_enabled, rahasia: li.sifat === 'Rahasia',
});

export async function trackingInfo(d: Deps, ctx: Ctx, id: number) {
  const li = await loadLetterIn(d.uow.read, ctx.actor, id);
  if (!(can.manageIn(ctx.actor) || can.dispose(ctx.actor))) throw forbidden();
  return trackingView(ctx, li);
}

export async function setTracking(d: Deps, ctx: Ctx, id: number, b: Body) {
  if (!can.manageIn(ctx.actor)) throw forbidden();
  const aksi = oneOf(b.aksi, ['aktifkan', 'nonaktifkan', 'buat_ulang'] as const, 'Aksi');
  return d.uow.run(async (r) => {
    const li = await loadLetterIn(r, ctx.actor, id);
    const code = aksi === 'buat_ulang' ? newTrackCode() : li.track_code;
    const aktif = aksi === 'buat_ulang' ? true : aksi === 'aktifkan';
    await r.lettersIn.setTracking(id, code, aktif);
    const teks = aksi === 'buat_ulang' ? 'Kode pelacakan dibuat ulang, tautan lama tidak berlaku' : aktif ? 'Pelacakan oleh pengirim diaktifkan' : 'Pelacakan oleh pengirim dimatikan';
    await r.journal.event({ letterInId: id, userId: ctx.actor.id, tipe: 'pelacakan', teks });
    await auditFor(r, ctx, 'PELACAKAN_DIUBAH', 'letter_in', id, { aksi });
    return trackingView(ctx, { ...li, track_code: code, track_enabled: aktif });
  });
}

/* ---------- Lembar disposisi untuk dicetak ---------- */

export async function dispositionSheet(d: Deps, ctx: Ctx, id: number) {
  const r = d.uow.read;
  const li = await loadLetterIn(r, ctx.actor, id);
  if (!(can.manageIn(ctx.actor) || can.dispose(ctx.actor) || is(ctx.actor, 'pejabat'))) throw forbidden();
  const [dispositions, instansi] = await Promise.all([r.dispositions.sheetRows(id), r.settings.get<Record<string, string>>('instansi')]);
  const { track_code: _t, ...letter } = li;
  return { letter, dispositions, instansi: instansi || {}, qr: await d.qr.toDataUrl(statusUrl(ctx, li.qr_token), 180) };
}
