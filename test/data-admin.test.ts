/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, test } from 'vitest';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import * as demoModule from '../scripts/demo.mjs';
import { startServer, type TestServer } from './support/server';

/** Ekspor dan impor, data referensi, instansi, tanda terima, unduhan draf, dan identitas aplikasi. */
const demo: any = demoModule;
const S: any = demo.Session;
let srv: TestServer; let url: string;
let tu: any; let pm: any; let admin: any; let andi: any; let kasi: any;

const expectStatus = async (p: Promise<unknown>, status: number) => assert.rejects(p, (e: any) => { assert.equal(e.status, status, e.message); return true; });

async function xlsx(columns: string[], rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Data');
  ws.addRow(columns);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const upload = (buf: Buffer, name = 'impor.xlsx', fields: Record<string, string> = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  f.append('file', new Blob([new Uint8Array(buf)]), name);
  return f;
};
const letterForm = (n: string, extra: Record<string, string> = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ no_surat: `X/${n}`, tgl_surat: '2026-10-01', tgl_diterima: '2026-10-08', asal: `Pengirim ${n}`, perihal: `[CONTOH] Data ${n}`, ...extra })) f.append(k, v);
  return f;
};
// PNG 1x1 piksel.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

beforeAll(async () => {
  srv = await startServer('surat_test3');
  url = srv.url;
  [tu, pm, admin, andi, kasi] = await Promise.all(['tu', 'pimpinan', 'admin', 'andi', 'kasi.data'].map((n) => new S(url, n).login()));
});

afterAll(async () => { await srv?.stop(); });

test('ekspor daftar: CSV, Excel, dan PDF berisi data sesuai filter', async () => {
  await tu.call('POST', '/api/letters-in', letterForm('E1', { sifat: 'Penting' }));
  await tu.call('POST', '/api/letters-in', letterForm('E2'));
  const csv = await tu.call('GET', '/api/letters-in?format=csv&sifat=Penting', undefined, { raw: true });
  assert.equal(csv.status, 200);
  const text = await csv.text();
  assert.match(text, /Data E1/);
  assert.doesNotMatch(text, /Data E2/);
  const x = await tu.call('GET', '/api/letters-in?format=xlsx', undefined, { raw: true });
  assert.equal(x.status, 200);
  assert.match(x.headers.get('content-type'), /spreadsheetml/);
  const xb = Buffer.from(await x.arrayBuffer());
  assert.equal(xb.subarray(0, 2).toString(), 'PK');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xb as any);
  assert.equal(wb.worksheets[0].getRow(1).getCell(1).value, 'No. Agenda');
  assert.ok(wb.worksheets[0].rowCount >= 3);
  const pdf = await tu.call('GET', '/api/letters-in?format=pdf', undefined, { raw: true });
  assert.equal(pdf.status, 200);
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
  for (const p of ['/api/letters-out?format=xlsx', '/api/tasks?format=pdf', '/api/laporan/surat-masuk?format=xlsx&tabel=0']) {
    const r = await pm.call('GET', p, undefined, { raw: true });
    assert.equal(r.status, 200, p);
  }
  const users = await admin.call('GET', '/api/users?format=xlsx', undefined, { raw: true });
  assert.equal(users.status, 200);
  await expectStatus(andi.get('/api/users?format=csv'), 403);
});

test('impor surat masuk dari Excel: baris valid dicatat, baris salah dilaporkan per baris', async () => {
  const tpl = await tu.call('GET', '/api/letters-in/impor', undefined, { raw: true });
  assert.equal(tpl.status, 200);
  assert.equal(Buffer.from(await tpl.arrayBuffer()).subarray(0, 2).toString(), 'PK');
  const buf = await xlsx(
    ['Nomor surat', 'Tanggal surat (YYYY-MM-DD)', 'Tanggal diterima (YYYY-MM-DD)', 'Pengirim', 'Instansi', 'Perihal', 'Jenis surat', 'Sifat', 'Prioritas'],
    [
      ['IMP/1', '2026-10-01', '2026-10-02', 'Kepala SD', 'SDN Impor', '[CONTOH] Impor satu', 'Surat Dinas', 'Biasa', 'Normal'],
      ['IMP/2', '2026-10-01', '2026-10-02', 'Kepala SD', 'SDN Impor', '', 'Surat Dinas', 'Biasa', 'Normal'],
      ['IMP/3', '2026-10-01', '2026-10-02', 'Kepala SD', 'SDN Impor', '[CONTOH] Impor tiga', 'Surat Ajaib', 'Biasa', 'Normal'],
    ],
  );
  const r = await tu.call('POST', '/api/letters-in/impor', upload(buf));
  assert.equal(r.ok, 1);
  assert.equal(r.gagal, 2);
  assert.deepEqual(r.results.filter((x: any) => !x.ok).map((x: any) => x.baris), [3, 4]);
  assert.match(r.results[1].error, /Perihal/);
  assert.match(r.results[2].error, /Jenis surat "Surat Ajaib" tidak ada di daftar/);
  const found = await tu.get('/api/letters-in?q=Impor%20satu');
  assert.equal(found.total, 1);
  await expectStatus(tu.call('POST', '/api/letters-in/impor', upload(Buffer.from('bukan excel'), 'x.xlsx')), 400);
  await expectStatus(andi.call('POST', '/api/letters-in/impor', upload(buf)), 403);
});

test('data referensi: admin menambah jenis surat, pilihan dipakai validasi, nilai sistem dikunci', async () => {
  const all = await tu.get('/api/referensi');
  assert.ok(all.sifat.some((x: any) => x.nilai === 'Rahasia'));
  assert.ok(all.jenis_surat.length > 0);
  await expectStatus(tu.call('POST', '/api/letters-in', letterForm('R1', { jenis: 'Surat Kilat Khusus' })), 400);
  await expectStatus(tu.post('/api/referensi', { kategori: 'jenis_surat', nilai: 'Surat Kilat Khusus' }), 403);
  const { id } = await admin.post('/api/referensi', { kategori: 'jenis_surat', nilai: 'Surat Kilat Khusus', urutan: 99 });
  await expectStatus(admin.post('/api/referensi', { kategori: 'jenis_surat', nilai: 'surat kilat khusus' }), 400);
  const made = await tu.call('POST', '/api/letters-in', letterForm('R2', { jenis: 'surat kilat khusus' }));
  const li = await tu.get(`/api/letters-in/${made.id}`);
  assert.equal(li.letter.jenis, 'Surat Kilat Khusus');
  const r = await admin.post('/api/referensi/bulk/aktif', { ids: [id], aktif: false });
  assert.equal(r.ok, 1);
  await expectStatus(tu.call('POST', '/api/letters-in', letterForm('R3', { jenis: 'Surat Kilat Khusus' })), 400);
  const adm = await admin.get('/api/referensi?kategori=sifat&semua=1');
  const rahasia = adm.sifat.find((x: any) => x.nilai === 'Rahasia');
  const lock = await admin.post('/api/referensi/bulk/aktif', { ids: [rahasia.id], aktif: false });
  assert.equal(lock.gagal, 1);
  await expectStatus(admin.put(`/api/referensi/${rahasia.id}`, { nilai: 'Sangat Rahasia' }), 400);
  const imp = await admin.call('POST', '/api/referensi/impor', upload(await xlsx(['Nilai', 'Keterangan'], [['Laporan Bulanan', 'x'], ['Laporan Bulanan', 'duplikat']]), 'r.xlsx', { kategori: 'jenis_surat' }));
  assert.equal(imp.ok, 1);
  assert.equal(imp.gagal, 1);
});

test('instansi: tambah, cari, saran, impor, dan nama ganda ditolak', async () => {
  const { id } = await tu.post('/api/instansi', { nama: 'Dinas Pendidikan Uji', singkatan: 'Disdik', alamat: 'Jl. Uji 1' });
  await expectStatus(tu.post('/api/instansi', { nama: 'dinas pendidikan uji' }), 400);
  await expectStatus(andi.post('/api/instansi', { nama: 'Instansi Andi' }), 403);
  const list = await tu.get('/api/instansi?q=Uji&sort=nama&dir=asc');
  assert.equal(list.total, 1);
  assert.equal(list.items[0].id, id);
  const opt = await andi.get('/api/instansi/options');
  assert.ok(opt.some((x: any) => x.nama === 'Dinas Pendidikan Uji'));
  const imp = await tu.call('POST', '/api/instansi/impor', upload(await xlsx(['Nama', 'Singkatan'], [['SMP Negeri Uji', 'SMPN'], ['', 'kosong']])));
  assert.equal(imp.ok, 1);
  assert.equal(imp.gagal, 1);
  await tu.post('/api/instansi/bulk/aktif', { ids: [id], aktif: false });
  const after = await andi.get('/api/instansi/options');
  assert.ok(!after.some((x: any) => x.id === id));
});

test('tanda terima: kode lacak dan QR untuk pengirim, hanya TU yang dapat membuka', async () => {
  const made = await tu.call('POST', '/api/letters-in', letterForm('T1'));
  const r = await tu.get(`/api/letters-in/${made.id}/tanda-terima`);
  assert.equal(r.letter.no_agenda, made.no_agenda);
  assert.equal(r.tracking.aktif, true);
  assert.match(r.tracking.kode, /^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/);
  assert.match(r.tracking.qr, /^data:image\/png;base64,/);
  const pub = await new S(url, 'anon').get(`/api/public/lacak/${r.tracking.kode}`);
  assert.equal(pub.steps[0].done, true);
  await expectStatus(andi.get(`/api/letters-in/${made.id}/tanda-terima`), 403);
  const secret = await tu.call('POST', '/api/letters-in', letterForm('T2', { sifat: 'Rahasia' }));
  const rs = await tu.get(`/api/letters-in/${secret.id}/tanda-terima`);
  assert.equal(rs.tracking.aktif, false);
  assert.equal(rs.tracking.qr, null);
});

test('surat keluar: hasil template dapat diunduh sebelum disimpan', async () => {
  const tpls = await kasi.get('/api/templates');
  const t = await kasi.get(`/api/templates/${tpls[0].id}`);
  const v = t.versions.find((x: any) => x.aktif);
  const body = { template_version_id: v.id, perihal: 'Unduh sebelum simpan', tujuan: 'Kepala Sekolah', tgl_surat: '2026-10-14', fields: {} };
  const html = await kasi.post('/api/letters-out/pratinjau', body);
  assert.match(html.html, /Unduh sebelum simpan/);
  const docx = await kasi.call('POST', '/api/letters-out/pratinjau?format=docx', body, { raw: true });
  assert.equal(docx.status, 200);
  assert.match(docx.headers.get('content-disposition'), /Unduh_sebelum_simpan\.docx/);
  assert.equal(Buffer.from(await docx.arrayBuffer()).subarray(0, 2).toString(), 'PK');
  const list = await kasi.get('/api/letters-out?q=Unduh%20sebelum');
  assert.equal(list.total, 0);
  await expectStatus(new S(url, 'viewer').login().then((s: any) => s.post('/api/letters-out/pratinjau?format=docx', body)), 403);
});

test('identitas aplikasi: admin mengubah nama, judul tab, dan ikon; halaman memakainya', async () => {
  await expectStatus(tu.put('/api/settings/tampilan', { nama: 'X', judul_tab: 'X' }), 403);
  await admin.put('/api/settings/tampilan', { nama: 'Persuratan Sudin', tagline: 'Kantor Uji', judul_tab: 'Persuratan Uji', deskripsi: 'Deskripsi uji untuk mesin pencari.' });
  const page = await (await fetch(`${url}/masuk`)).text();
  assert.match(page, /<title>Masuk \| Persuratan Uji<\/title>/);
  assert.match(page, /Deskripsi uji untuk mesin pencari\./);
  assert.match(page, /Persuratan Sudin/);
  await expectStatus(new S(url, 'anon').get('/api/branding/ikon'), 404);
  const f = new FormData();
  f.append('file', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), 'ikon.png');
  await expectStatus(tu.call('POST', '/api/branding/ikon', f), 403);
  await admin.call('POST', '/api/branding/ikon', f);
  const icon = await fetch(`${url}/api/branding/ikon`);
  assert.equal(icon.status, 200);
  assert.equal(icon.headers.get('content-type'), 'image/png');
  assert.match(await (await fetch(`${url}/masuk`)).text(), /rel="icon" href="\/api\/branding\/ikon\?v=1"/);
  await admin.call('DELETE', '/api/branding/ikon');
  assert.equal((await fetch(`${url}/api/branding/ikon`)).status, 404);
});

test('impor pengguna dan unit kerja', async () => {
  const units = await admin.call('POST', '/api/units/impor', upload(await xlsx(['Kode', 'Nama'], [['UJI', 'Seksi Uji'], ['UJI', 'Ganda']])));
  assert.equal(units.ok, 1);
  assert.equal(units.gagal, 1);
  const users = await admin.call('POST', '/api/users/impor', upload(await xlsx(
    ['Nama pengguna', 'Nama', 'Peran', 'Kode unit', 'Kata sandi awal'],
    [['citra.uji', 'Citra Uji', 'Pelaksana', 'UJI', 'RahasiaUji123'], ['dodi.uji', 'Dodi Uji', 'raja', 'UJI', 'RahasiaUji123'], ['eko.uji', 'Eko Uji', 'pelaksana', 'TIDAKADA', 'RahasiaUji123']],
  )));
  assert.equal(users.ok, 1);
  assert.match(users.results[1].error, /Peran "raja" tidak dikenal/);
  assert.match(users.results[2].error, /Kode unit "TIDAKADA" tidak ditemukan/);
  const citra = await new S(url, 'citra.uji').login('RahasiaUji123');
  assert.equal((await citra.get('/api/auth/me')).user.role, 'pelaksana');
});
