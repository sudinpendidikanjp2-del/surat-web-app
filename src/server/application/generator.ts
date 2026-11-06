import { forbidden, notFound } from '@/domain/errors';
import { cleanFields, PLACEHOLDER_NOMOR, type TemplateField } from '@/domain/letter-out';
import { can } from '@/domain/roles';
import { int, oneOf, today } from '@/domain/validation';
import type { Ctx, Deps } from './context';
import type { Repos } from './ports';

type Body = Record<string, unknown>;

/**
 * Buat Surat dari template: isi template DOCX lalu tampilkan atau unduh hasilnya (Word, atau PDF bila LibreOffice ada).
 * Tidak menyimpan apa pun: surat dicetak dan ditandatangani di luar aplikasi, lalu dicatat sebagai surat keluar.
 */
interface Draft { fields: Record<string, string>; perihal: string; tujuan: string; tgl_surat: string; nomor_surat: string | null; penandatangan_id: number | null }

/** Nilai placeholder: field isian, kolom bawaan, dan field sistem (kop, penandatangan, nomor). */
async function buildValues(d: Deps, r: Repos, draft: Draft, fields: TemplateField[]) {
  const inst = (await r.settings.get<Record<string, string>>('instansi')) || {};
  const signer = draft.penandatangan_id ? await r.users.signer(draft.penandatangan_id) : null;
  const nomor = draft.nomor_surat || PLACEHOLDER_NOMOR;
  return d.documents.formatValues(fields, {
    ...draft.fields,
    perihal: draft.perihal, hal: draft.perihal, nama_penerima: draft.tujuan, kepada: draft.tujuan, tanggal: draft.tgl_surat,
    nomor_surat: nomor, nomor,
    kop_instansi: inst.nama || '', kop_alamat: inst.alamat || '', kota: inst.kota || '',
    penandatangan: signer?.nama || '', penandatangan_nama: signer?.nama || '', penandatangan_jabatan: signer?.jabatan || '',
    penandatangan_nip: signer?.nip || '', penandatangan_pangkat: signer?.pangkat || '',
  });
}

const richNames = (fields: TemplateField[]) => fields.filter((f) => f.type === 'rich').map((f) => f.name);

async function render(d: Deps, ctx: Ctx, b: Body) {
  if (!can.writeOut(ctx.actor)) throw forbidden('Peran Anda tidak dapat membuat surat');
  const r = d.uow.read;
  const tv = await r.templates.versionWithTemplate(int(b.template_version_id, 'Template'));
  if (!tv || !tv.template_aktif) throw notFound('Template tidak ditemukan');
  const draft: Draft = {
    fields: cleanFields(tv.fields, b.fields as Record<string, unknown>),
    perihal: String(b.perihal || '').slice(0, 500),
    tujuan: String(b.tujuan || '').slice(0, 500),
    tgl_surat: (b.tgl_surat as string) || today(),
    nomor_surat: String(b.nomor_surat || '').trim().slice(0, 120) || null,
    penandatangan_id: int(b.penandatangan_id, 'Penandatangan', { required: false }),
  };
  return d.documents.render(await d.files.read(tv.file_path), await buildValues(d, r, draft, tv.fields), richNames(tv.fields));
}

export async function preview(d: Deps, ctx: Ctx, b: Body) {
  return { html: await d.documents.toHtml(await render(d, ctx, b)) };
}

export async function download(d: Deps, ctx: Ctx, b: Body, format: unknown) {
  const fmt = oneOf(format || 'docx', ['docx', 'pdf'] as const, 'Format');
  let buf = await render(d, ctx, b);
  if (fmt === 'pdf') buf = await d.documents.toPdf(buf);
  const name = String(b.perihal || 'surat').slice(0, 60).replace(/[^A-Za-z0-9._-]+/g, '_') || 'surat';
  return {
    body: buf, filename: `${name}.${fmt}`,
    mime: fmt === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
}
