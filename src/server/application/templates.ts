import { forbidden, invalid, notFound } from '@/domain/errors';
import { withBawaan, type TemplateField } from '@/domain/letter-out';
import { can } from '@/domain/roles';
import { int, oneOf, str } from '@/domain/validation';
import { auditFor, type Ctx, type Deps } from './context';
import type { IncomingFile, Repos } from './ports';

type Body = Record<string, unknown>;
const requireAdmin = (ctx: Ctx) => { if (!can.admin(ctx.actor)) throw forbidden(); };

export async function list(d: Deps, ctx: Ctx) {
  const all = can.admin(ctx.actor);
  const rows = await d.uow.read.templates.list(!all);
  return all ? rows : rows.filter((x) => x.versi_aktif_id);
}

export async function detail(d: Deps, ctx: Ctx, id: number) {
  const admin = can.admin(ctx.actor);
  const t = await d.uow.read.templates.find(id);
  if (!t || (!t.aktif && !admin)) throw notFound('Template tidak ditemukan');
  const versions = await d.uow.read.templates.versions(id, !admin);
  return { template: t, versions: versions.map((v) => ({ ...v, fields: withBawaan(v.fields) })) };
}

async function createVersion(d: Deps, r: Repos, ctx: Ctx, templateId: number, file: IncomingFile, catatan: string | null, activate: boolean) {
  d.files.validate(file);
  if (!file.name.toLowerCase().endsWith('.docx')) throw invalid('Template harus berformat DOCX');
  const fields: TemplateField[] = d.documents.extractFields(file.buffer);
  if (fields.length === 0) throw invalid('Tidak ada isian ditemukan. Tulis isian dengan format {{nama_isian}} di dalam dokumen');
  const path = await d.files.save(file.buffer, 'docx');
  const v = await r.templates.addVersion({ templateId, catatan, path, fields, activate, userId: ctx.actor.id });
  return { ...v, fields };
}

export async function create(d: Deps, ctx: Ctx, b: Body, file: IncomingFile | null) {
  requireAdmin(ctx);
  if (!file) throw invalid('Unggah file template DOCX');
  const nama = str(b.nama, 'Nama template', { max: 120 });
  const jenis = str(b.jenis, 'Jenis surat', { max: 80 });
  const kode = str(b.kode, 'Kode template', { max: 40 }).toLowerCase();
  if (!/^[a-z0-9-]+$/.test(kode)) throw invalid('Kode template hanya boleh huruf kecil, angka, dan strip');
  return d.uow.run(async (r) => {
    if (await r.templates.codeExists(kode)) throw invalid('Kode template sudah dipakai');
    const id = await r.templates.insert({
      nama, kode, jenis, deskripsi: str(b.deskripsi, 'Deskripsi', { max: 400, required: false }),
      kodeKlasifikasi: str(b.kode_klasifikasi, 'Kode klasifikasi', { max: 20, required: false }), userId: ctx.actor.id,
    });
    const v = await createVersion(d, r, ctx, id, file, 'Versi awal', true);
    await auditFor(r, ctx, 'TEMPLATE_DIBUAT', 'template', id, { nama, kode, field: v.fields.length });
    return { id, versi: v.versi };
  });
}

export async function update(d: Deps, ctx: Ctx, id: number, b: Body) {
  requireAdmin(ctx);
  const data = {
    nama: str(b.nama, 'Nama template', { max: 120 }), jenis: str(b.jenis, 'Jenis surat', { max: 80 }),
    deskripsi: str(b.deskripsi, 'Deskripsi', { max: 400, required: false }), kodeKlasifikasi: str(b.kode_klasifikasi, 'Kode klasifikasi', { max: 20, required: false }),
    aktif: b.aktif !== false,
  };
  await d.uow.run(async (r) => {
    if (!(await r.templates.update(id, data))) throw notFound();
    await auditFor(r, ctx, 'TEMPLATE_DIUBAH', 'template', id, { aktif: data.aktif });
  });
}

export async function newVersion(d: Deps, ctx: Ctx, id: number, b: Body, file: IncomingFile | null) {
  requireAdmin(ctx);
  if (!file) throw invalid('Unggah file template DOCX');
  return d.uow.run(async (r) => {
    if (!(await r.templates.find(id))) throw notFound();
    const v = await createVersion(d, r, ctx, id, file, str(b.catatan, 'Catatan versi', { max: 300, required: false }), b.aktifkan !== 'false');
    await auditFor(r, ctx, 'TEMPLATE_VERSI_BARU', 'template', id, { versi: v.versi });
    return { id: v.id, versi: v.versi };
  });
}

export async function activateVersion(d: Deps, ctx: Ctx, id: number, vid: number) {
  requireAdmin(ctx);
  await d.uow.run(async (r) => {
    const versi = await r.templates.activate(id, vid);
    if (versi == null) throw notFound();
    await auditFor(r, ctx, 'TEMPLATE_VERSI_AKTIF', 'template', id, { versi });
  });
}

/** Ubah label, jenis, dan wajib-isi field. Nama field tidak dapat diubah karena terikat ke dokumen. */
export async function updateFields(d: Deps, ctx: Ctx, id: number, vid: number, b: Body) {
  requireAdmin(ctx);
  await d.uow.run(async (r) => {
    const v = await r.templates.versionOf(id, vid);
    if (!v) throw notFound();
    const incoming = (Array.isArray(b.fields) ? b.fields : []) as Partial<TemplateField>[];
    const fields = v.fields.map((f) => {
      const n = incoming.find((x) => x.name === f.name);
      if (!n || f.sistem) return f;
      return { ...f, label: str(n.label, `Label ${f.name}`, { max: 80 }), type: oneOf(n.type, ['text', 'textarea', 'date'] as const, 'Jenis isian'), required: Boolean(n.required) };
    });
    await r.templates.setFields(vid, fields);
    await auditFor(r, ctx, 'TEMPLATE_FIELD_DIUBAH', 'template', id, { versi_id: vid });
  });
}

export async function downloadVersion(d: Deps, ctx: Ctx, id: number, vid: number) {
  requireAdmin(ctx);
  const v = await d.uow.read.templates.versionOf(id, vid);
  if (!v) throw notFound();
  return { body: await d.files.read(v.file_path), filename: `${v.kode}-v${v.versi}.docx` };
}

/** Pratinjau template: setiap isian tampil sebagai [nama_isian]. */
export async function previewVersion(d: Deps, _ctx: Ctx, id: number, vid: number) {
  const v = await d.uow.read.templates.versionOf(id, vid);
  if (!v) throw notFound();
  const values = Object.fromEntries(v.fields.map((f) => [f.name, `[${f.name}]`]));
  return { html: await d.documents.toHtml(d.documents.render(await d.files.read(v.file_path), values)) };
}

export const parseIds = (id: string, vid?: string) => ({ id: int(id, 'ID'), vid: vid ? int(vid, 'Versi') : 0 });
