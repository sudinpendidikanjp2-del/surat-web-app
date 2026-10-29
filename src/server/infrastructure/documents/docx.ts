import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import mammoth from 'mammoth';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { invalid, isAppError, unavailable } from '@/domain/errors';
import { hariTanggalIndo, tanggalIndo } from '@/domain/calendar';
import type { TemplateField } from '@/domain/letter-out';
import type { DefaultTemplate, DocumentRenderer } from '@/server/application/ports';
import { richToBlocks, richToRuns, textWidth } from './rich-ooxml';

const run = promisify(execFile);

/** Field yang diisi sistem, tidak muncul di form. `tanggal` diatur lewat kolom tanggal surat. */
export const SYSTEM_FIELDS = new Set([
  'nomor_surat', 'nomor', 'tanggal', 'kop_instansi', 'kop_alamat', 'kota',
  'penandatangan', 'penandatangan_nama', 'penandatangan_jabatan', 'penandatangan_nip', 'penandatangan_pangkat',
]);

/** Field yang lazim boleh kosong (misalnya surat tanpa lampiran). Admin dapat mengubahnya per template. */
const OPTIONAL_BY_DEFAULT = new Set(['lampiran', 'sifat']);

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

function paragraphsText(xml: string) {
  const out: string[] = [];
  const paras = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
  for (const p of paras) {
    const parts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]);
    out.push(parts.join(''));
  }
  return out;
}

const humanize = (name: string) =>
  name
    .split('_')
    .map((w) => (w === 'nip' ? 'NIP' : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

function guessType(name: string): TemplateField['type'] {
  if (/^tanggal/.test(name)) return 'date';
  // Isi utama surat memakai editor kaya (tabel, daftar, tebal). Penggal kalimat pendek tetap beberapa baris biasa.
  if (/^(isi|uraian)/.test(name)) return 'rich';
  if (/(^dasar|^agenda|^maksud|^penutup|_surat$)/.test(name) && name !== 'nomor_surat' && name !== 'tgl_surat') return 'textarea';
  return 'text';
}

/** Baca placeholder dari file DOCX (isi, header, footer). Urutan sesuai kemunculan. */
export function extractFields(buffer: Buffer): TemplateField[] {
  let zip: PizZip;
  try {
    zip = new PizZip(buffer);
  } catch {
    throw invalid('File bukan DOCX yang valid');
  }
  if (!zip.file('word/document.xml')) throw invalid('File bukan DOCX yang valid');
  const names = zip.file(/^word\/(document|header\d*|footer\d*)\.xml$/).map((f) => f.name);
  const seen = new Set<string>();
  const fields: TemplateField[] = [];
  for (const n of names) {
    for (const text of paragraphsText(zip.file(n)!.asText())) {
      for (const m of text.matchAll(PLACEHOLDER)) {
        const name = m[1];
        if (seen.has(name)) continue;
        seen.add(name);
        const sistem = SYSTEM_FIELDS.has(name);
        fields.push({ name, label: humanize(name), type: guessType(name), required: !sistem && !OPTIONAL_BY_DEFAULT.has(name), sistem });
      }
    }
  }
  return fields;
}

const RICH_MARK = (i: number) => `RICHFIELDMARK${i}X`;
const PARAGRAPH = /<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>/g;

/**
 * Ganti penanda isian kaya dengan XML hasil editor. Bila penanda berdiri sendiri di paragrafnya, seluruh paragraf
 * diganti blok (paragraf, daftar, tabel) yang mewarisi gaya paragraf itu; bila berada di tengah kalimat, isinya
 * disisipkan sebagai run dengan baris baru.
 */
function injectRich(xml: string, rich: Map<string, string>, width: number) {
  return xml.replace(PARAGRAPH, (para) => {
    const marks = [...rich.keys()].filter((m) => para.includes(m));
    if (!marks.length) return para;
    const text = [...para.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join('');
    if (marks.length === 1 && !text.replace(marks[0], '').trim()) {
      const pPr = (/<w:pPr>[\s\S]*?<\/w:pPr>/.exec(para)?.[0] ?? '').replace(/<w:rPr>[\s\S]*?<\/w:rPr>/, '');
      const at = para.indexOf(marks[0]);
      const runStart = Math.max(para.lastIndexOf('<w:r>', at), para.lastIndexOf('<w:r ', at));
      const rPr = runStart >= 0 ? (/^<w:r(?: [^>]*)?>\s*(<w:rPr>[\s\S]*?<\/w:rPr>)?/.exec(para.slice(runStart))?.[1] ?? '') : '';
      return richToBlocks(rich.get(marks[0])!, { pPr, rPr, width });
    }
    return para.replace(/<w:r(?: [^>]*)?>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, (run) => {
      const m = marks.find((k) => run.includes(k));
      if (!m) return run;
      const rPr = /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(run)?.[0] ?? '';
      const t = /<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/.exec(run)?.[1] ?? '';
      const [before, after] = [t.slice(0, t.indexOf(m)), t.slice(t.indexOf(m) + m.length)];
      const piece = (s: string) => (s ? `<w:r>${rPr}<w:t xml:space="preserve">${s}</w:t></w:r>` : '');
      return piece(before) + richToRuns(rich.get(m)!, rPr) + piece(after);
    });
  });
}

/**
 * Isi template dengan data. values: { nama_field: string }. Field bertipe date diformat tanggal Indonesia.
 * richFields: nama isian yang nilainya HTML dari editor kaya; diubah menjadi paragraf, daftar, dan tabel Word.
 */
export function renderDocx(buffer: Buffer, values: Record<string, string>, richFields: string[] = []): Buffer {
  const zip = new PizZip(buffer);
  const rich = new Map<string, string>();
  const data = { ...values };
  richFields.forEach((name, i) => {
    if (!data[name]) return;
    rich.set(RICH_MARK(i), data[name]);
    data[name] = RICH_MARK(i);
  });
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });
  try {
    doc.render(data);
  } catch (e) {
    const err = e as { properties?: { explanation?: string }; message?: string };
    throw invalid(`Template tidak dapat diproses: ${err.properties?.explanation || err.message}`);
  }
  const out = doc.getZip();
  if (rich.size) {
    const width = textWidth(out.file('word/document.xml')?.asText() ?? '');
    for (const f of out.file(/^word\/(document|header\d*|footer\d*)\.xml$/)) {
      const xml = f.asText();
      if ([...rich.keys()].some((m) => xml.includes(m))) out.file(f.name, injectRich(xml, rich, width));
    }
  }
  return out.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export function formatValues(fields: TemplateField[], raw: Record<string, unknown>) {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = raw[f.name];
    if (v == null || v === '') {
      out[f.name] = '';
      continue;
    }
    if (f.type === 'date') out[f.name] = f.name === 'tanggal' ? tanggalIndo(String(v)) : hariTanggalIndo(String(v));
    else out[f.name] = String(v);
  }
  return out;
}

export async function docxToHtml(buffer: Buffer) {
  const r = await mammoth.convertToHtml({ buffer });
  return r.value;
}

export async function docxToPdf(buffer: Buffer) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'surat-pdf-'));
  const src = path.join(dir, `${crypto.randomUUID()}.docx`);
  try {
    await fs.writeFile(src, buffer);
    await run('soffice', [
      '-env:UserInstallation=file:///tmp/surat-lo-profile',
      '--headless', '--convert-to', 'pdf', '--outdir', dir, src,
    ], { timeout: 90000 });
    return await fs.readFile(src.replace(/\.docx$/, '.pdf'));
  } catch (e) {
    if (isAppError(e)) throw e;
    throw unavailable('Konversi PDF tidak tersedia di server ini (LibreOffice tidak ditemukan atau gagal). Gunakan DOCX atau cetak dari pratinjau');
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/* ---------- Pembuat DOCX sederhana untuk template bawaan ---------- */

const esc = (s: unknown) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface Paragraph { text?: string; align?: string; bold?: boolean; size?: number; after?: number; left?: number; hanging?: number; tabs?: number[]; border?: boolean; caps?: boolean }

function paraXml(p: Paragraph) {
  const { text = '', align = 'both', bold = false, size = 24, after = 120, left = 0, hanging = 0, tabs = [], border = false, caps = false } = p;
  const rpr = `<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>${bold ? '<w:b/>' : ''}${caps ? '<w:caps/>' : ''}<w:sz w:val="${size}"/></w:rPr>`;
  const runs = String(text)
    .split('\t')
    .map((seg, i) => `${i > 0 ? `<w:r>${rpr}<w:tab/></w:r>` : ''}<w:r>${rpr}<w:t xml:space="preserve">${esc(seg)}</w:t></w:r>`)
    .join('');
  const tabXml = tabs.length ? `<w:tabs>${tabs.map((t) => `<w:tab w:val="left" w:pos="${t}"/>`).join('')}</w:tabs>` : '';
  const ind = left || hanging ? `<w:ind w:left="${left}" ${hanging ? `w:hanging="${hanging}"` : ''}/>` : '';
  const bdr = border ? '<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="000000"/></w:pBdr>' : '';
  return `<w:p><w:pPr>${bdr}${tabXml}<w:spacing w:after="${after}" w:line="276" w:lineRule="auto"/>${ind}<w:jc w:val="${align}"/></w:pPr>${runs}</w:p>`;
}

export function buildDocx(paragraphs: Paragraph[]): Buffer {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  const body = paragraphs.map(paraXml).join('');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1418" w:bottom="1134" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

const kop: Paragraph[] = [
  { text: '{{kop_instansi}}', align: 'center', bold: true, size: 28, after: 0, caps: true },
  { text: '{{kop_alamat}}', align: 'center', size: 20, after: 200, border: true },
];
const ttd: Paragraph[] = [
  { text: '', after: 240 },
  { text: '{{penandatangan_jabatan}}', align: 'left', left: 5200, after: 0 },
  { text: '', after: 720 },
  { text: '{{penandatangan_nama}}', align: 'left', left: 5200, bold: true, after: 0 },
  { text: 'NIP {{penandatangan_nip}}', align: 'left', left: 5200, after: 0 },
];
const row = (label: string, ph: string): Paragraph => ({ text: `${label}\t: ${ph}`, align: 'left', tabs: [1800], left: 1800, hanging: 1800, after: 40 });

export const DEFAULT_TEMPLATES: (DefaultTemplate & { paragraphs: Paragraph[] })[] = [
  {
    kode: 'undangan',
    nama: 'Surat Undangan',
    jenis: 'Surat Undangan',
    deskripsi: 'Undangan rapat atau kegiatan kepada pihak luar.',
    paragraphs: [
      ...kop,
      { text: '{{kota}}, {{tanggal}}', align: 'right', after: 200 },
      row('Nomor', '{{nomor_surat}}'),
      row('Sifat', '{{sifat}}'),
      row('Lampiran', '{{lampiran}}'),
      { ...row('Perihal', '{{perihal}}'), bold: true, after: 240 },
      { text: 'Yth. {{nama_penerima}}', align: 'left', after: 0 },
      { text: 'di', align: 'left', after: 0 },
      { text: '{{alamat_penerima}}', align: 'left', after: 240 },
      { text: 'Dengan hormat,' },
      { text: 'Sehubungan dengan {{dasar_surat}}, kami mengundang Bapak/Ibu untuk menghadiri {{nama_kegiatan}} pada:', after: 160 },
      row('Hari/Tanggal', '{{tanggal_kegiatan}}'),
      row('Waktu', '{{waktu_kegiatan}}'),
      row('Tempat', '{{tempat_kegiatan}}'),
      { ...row('Agenda', '{{agenda}}'), after: 200 },
      { text: 'Demikian disampaikan. Atas perhatian dan kehadiran Bapak/Ibu, kami ucapkan terima kasih.' },
      ...ttd,
    ],
  },
  {
    kode: 'tugas',
    nama: 'Surat Tugas',
    jenis: 'Surat Tugas',
    deskripsi: 'Penugasan pegawai untuk suatu kegiatan.',
    paragraphs: [
      ...kop,
      { text: 'SURAT TUGAS', align: 'center', bold: true, after: 0 },
      { text: 'Nomor: {{nomor_surat}}', align: 'center', after: 240 },
      { text: 'Dasar: {{dasar}}', align: 'left', after: 200 },
      { text: 'Memberikan tugas kepada:', align: 'left', after: 120 },
      row('Nama', '{{nama_pegawai}}'),
      row('NIP', '{{nip}}'),
      row('Pangkat', '{{pangkat}}'),
      { ...row('Jabatan', '{{jabatan}}'), after: 200 },
      { text: 'Untuk {{maksud}}.', after: 160 },
      row('Tempat', '{{tempat}}'),
      row('Mulai', '{{tanggal_mulai}}'),
      { ...row('Selesai', '{{tanggal_selesai}}'), after: 200 },
      { text: 'Demikian surat tugas ini dibuat untuk dilaksanakan dengan penuh tanggung jawab.' },
      { text: '{{kota}}, {{tanggal}}', align: 'left', left: 5200, after: 0 },
      ...ttd,
    ],
  },
  {
    kode: 'keterangan',
    nama: 'Surat Keterangan',
    jenis: 'Surat Keterangan',
    deskripsi: 'Keterangan resmi tentang seorang pegawai.',
    paragraphs: [
      ...kop,
      { text: 'SURAT KETERANGAN', align: 'center', bold: true, after: 0 },
      { text: 'Nomor: {{nomor_surat}}', align: 'center', after: 240 },
      { text: 'Yang bertanda tangan di bawah ini menerangkan bahwa:', after: 120 },
      row('Nama', '{{nama_pegawai}}'),
      row('NIP', '{{nip}}'),
      row('Jabatan', '{{jabatan}}'),
      { ...row('Unit Kerja', '{{unit_kerja}}'), after: 200 },
      { text: '{{isi_surat}}', after: 200 },
      { text: 'Demikian surat keterangan ini dibuat untuk dipergunakan sebagaimana mestinya.' },
      { text: '{{kota}}, {{tanggal}}', align: 'left', left: 5200, after: 0 },
      ...ttd,
    ],
  },
  {
    kode: 'nota-dinas',
    nama: 'Nota Dinas',
    jenis: 'Nota Dinas',
    deskripsi: 'Komunikasi tertulis antar pejabat di lingkungan internal.',
    paragraphs: [
      ...kop,
      { text: 'NOTA DINAS', align: 'center', bold: true, after: 240 },
      row('Kepada', '{{kepada}}'),
      row('Dari', '{{dari}}'),
      row('Tanggal', '{{tanggal}}'),
      row('Nomor', '{{nomor}}'),
      row('Sifat', '{{sifat}}'),
      row('Lampiran', '{{lampiran}}'),
      { ...row('Hal', '{{hal}}'), bold: true, after: 200 },
      { text: '{{isi}}', after: 200 },
      { text: '{{penutup}}' },
      ...ttd,
    ],
  },
  {
    kode: 'pengantar',
    nama: 'Surat Pengantar',
    jenis: 'Surat Pengantar',
    deskripsi: 'Pengantar pengiriman dokumen atau data.',
    paragraphs: [
      ...kop,
      { text: '{{kota}}, {{tanggal}}', align: 'right', after: 200 },
      row('Nomor', '{{nomor_surat}}'),
      row('Lampiran', '{{lampiran}}'),
      { ...row('Perihal', '{{perihal}}'), bold: true, after: 240 },
      { text: 'Yth. {{nama_penerima}}', align: 'left', after: 0 },
      { text: 'di', align: 'left', after: 0 },
      { text: '{{alamat_penerima}}', align: 'left', after: 240 },
      { text: '{{isi_surat}}', after: 200 },
      { text: 'Demikian disampaikan, atas perhatian Bapak/Ibu kami ucapkan terima kasih.' },
      ...ttd,
    ],
  },
];

/** Adaptor DocumentRenderer: docxtemplater untuk isi, mammoth untuk pratinjau HTML, LibreOffice untuk PDF. */
export const docxRenderer: DocumentRenderer = {
  extractFields,
  formatValues,
  render: renderDocx,
  toHtml: docxToHtml,
  toPdf: docxToPdf,
  build: (paragraphs) => buildDocx(paragraphs as Paragraph[]),
  defaultTemplates: () => DEFAULT_TEMPLATES,
};
