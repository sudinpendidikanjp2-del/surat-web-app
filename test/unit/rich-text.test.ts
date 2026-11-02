import { test } from 'vitest';
import assert from 'node:assert/strict';
import PizZip from 'pizzip';
import { buildDocx, docxToHtml, extractFields, renderDocx } from '@/server/infrastructure/documents/docx';
import { richIsEmpty, richToPlain } from '@/domain/rich-text';

const HTML = [
  '<p style="text-align: center"><strong>Daftar</strong> peserta &amp; <em>jadwal</em></p>',
  '<ul><li><p>Satu</p></li><li><p>Dua<br>baris</p><ol><li><p>Anak</p></li></ol></li></ul>',
  '<table><tbody><tr><th colspan="2"><p>Nama dan NIP</p></th><th><p>Unit</p></th></tr>',
  '<tr><td><p>Andi</p></td><td><p>1980</p></td><td rowspan="2"><p>Data</p></td></tr>',
  '<tr><td><p>Budi</p></td><td><p>1981</p></td></tr></tbody></table>',
  '<p>Penutup <u>bergaris</u> <s>coret</s></p><script>alert(1)</script>',
].join('');

const template = () => buildDocx([
  { text: 'Kepada {{nama_penerima}}', align: 'left' },
  { text: '{{isi_surat}}', after: 200, left: 400 },
  { text: 'Catatan: {{catatan}} selesai.' },
]);

test('isian isi_* dikenali sebagai teks kaya', () => {
  const f = extractFields(template());
  assert.equal(f.find((x) => x.name === 'isi_surat')?.type, 'rich');
  assert.equal(f.find((x) => x.name === 'catatan')?.type, 'text');
});

test('HTML editor menjadi paragraf, daftar, dan tabel Word yang sah', async () => {
  const out = renderDocx(template(), { nama_penerima: 'Yth. Kepala', isi_surat: HTML, catatan: '<p>A</p><p>B</p>' }, ['isi_surat', 'catatan']);
  const xml = new PizZip(out).file('word/document.xml')!.asText();
  assert.ok(!xml.includes('RICHFIELDMARK'), 'penanda harus terganti');
  assert.ok(!xml.includes('alert'), 'skrip tidak ikut');
  assert.match(xml, /<w:tbl>/);
  assert.match(xml, /<w:gridSpan w:val="2"\/>/);
  assert.match(xml, /<w:vMerge w:val="restart"\/>/);
  assert.match(xml, /<w:vMerge\/>/);
  assert.match(xml, /<w:jc w:val="center"\/>/);
  assert.match(xml, /<w:u w:val="single"\/>/);
  assert.match(xml, /<w:strike\/>/);
  // Paragraf mewarisi indentasi placeholder (400) dan daftar bertambah dari situ.
  assert.match(xml, /<w:ind w:left="760" w:hanging="360"\/>/);
  // Placeholder di tengah kalimat: teks sekitarnya tetap, isi disambung baris baru.
  assert.match(xml, /Catatan: <\/w:t><\/w:r><w:r>.*?A<\/w:t><\/w:r><w:r>.*?<w:br\/><\/w:r><w:r>.*?B<\/w:t>.*? selesai\./);
  const html = await docxToHtml(out);
  assert.match(html, /<table>/);
  assert.match(html, /Andi/);
  assert.match(html, /Daftar/);
  assert.match(html, /• ?(\t)?Satu|Satu/);
});

test('nilai lama berupa teks biasa tetap tampil per baris', async () => {
  const out = renderDocx(template(), { isi_surat: 'Baris satu\nBaris dua' }, ['isi_surat']);
  const html = await docxToHtml(out);
  assert.match(html, /<p>Baris satu<\/p><p>Baris dua<\/p>/);
});

test('isi kaya kosong dianggap belum diisi', () => {
  assert.equal(richIsEmpty('<p></p>'), true);
  assert.equal(richIsEmpty('<table><tr><td><p> </p></td></tr></table>'), true);
  assert.equal(richIsEmpty('<p>Ada</p>'), false);
  assert.equal(richToPlain('<p>A &amp; B</p><table><tr><td><p>x</p></td><td><p>y</p></td></tr></table>'), 'A & B\nx\ty');
});
