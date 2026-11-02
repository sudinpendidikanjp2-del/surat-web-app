/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as demoModule from '../scripts/demo.mjs';
import { startServer, type TestServer } from './support/server';
import { startFakeGoogle } from './support/fake-google';

const demo: any = demoModule;
const S: any = demo.Session;
let srv: TestServer; let url: string; let g: Awaited<ReturnType<typeof startFakeGoogle>>;
let admin: any; let tu: any;
const backupDir = `/tmp/surat-test-backups-${process.pid}`;

const letterForm = (n: string) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ no_surat: `G/${n}`, tgl_surat: '2026-10-01', tgl_diterima: '2026-10-08', asal: `Pengirim ${n}`, perihal: `Surat cadangan ${n}` })) f.append(k, v);
  f.append('files', new Blob([Buffer.from(`%PDF-1.4\n% isi ${n}\n%%EOF`)], { type: 'application/pdf' }), `surat-${n}.pdf`);
  return f;
};
const expectStatus = async (p: Promise<unknown>, status: number, msg?: RegExp) =>
  assert.rejects(p, (e: any) => { assert.equal(e.status, status, e.message); if (msg) assert.match(e.message, msg); return true; });
const waitSync = async () => {
  for (let i = 0; i < 100; i++) {
    const s = await admin.get('/api/google');
    if (!s.proses.berjalan) return s;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Sinkronisasi tidak selesai');
};

beforeAll(async () => {
  fs.rmSync(backupDir, { recursive: true, force: true });
  g = await startFakeGoogle();
  srv = await startServer('surat_test_google', { ...g.env, BACKUP_DIR: backupDir });
  url = srv.url;
  [admin, tu] = await Promise.all(['admin', 'tu'].map((n) => new S(url, n).login()));
});

afterAll(async () => {
  await srv?.stop();
  await g?.stop();
});

test('isi surat kaya: tabel dari editor tampil di pratinjau surat keluar', async () => {
  const tpls = await tu.get('/api/templates');
  const pengantar = tpls.find((t: any) => t.kode === 'pengantar');
  const t = await tu.get(`/api/templates/${pengantar.id}`);
  const v = t.versions.find((x: any) => x.aktif);
  assert.equal(v.fields.find((f: any) => f.name === 'isi_surat').type, 'rich');
  const html = '<p>Bersama ini:</p><table><tbody><tr><th><p>No</p></th><th><p>Dokumen</p></th></tr><tr><td><p>1</p></td><td><p>Laporan <strong>triwulan</strong></p></td></tr></tbody></table>';
  const r = await tu.post('/api/letters-out/pratinjau', { template_version_id: v.id, perihal: 'Kirim laporan', tujuan: 'Kepala Dinas', tgl_surat: '2026-10-14', fields: { isi_surat: html, lampiran: '1 berkas' } });
  assert.match(r.html, /<table>/);
  assert.match(r.html, /<strong>triwulan<\/strong>/);
});

test('pengaturan umum tidak membocorkan kredensial Google', async () => {
  await admin.put('/api/google', { mode: 'service', service_json: g.serviceJson, folder: `https://drive.google.com/drive/folders/${g.SHARED}` });
  const s = await tu.get('/api/settings');
  assert.ok(!('google' in s));
  assert.ok(!JSON.stringify(s).includes('PRIVATE KEY'));
  const st = await admin.get('/api/google');
  assert.ok(!JSON.stringify(st).includes('PRIVATE KEY'));
  assert.equal(st.ada_kunci_layanan, true);
  await expectStatus(tu.get('/api/google'), 403);
});

test('akun layanan: uji sambungan, lampiran tersusun per folder, rekap ke spreadsheet', async () => {
  await expectStatus(admin.put('/api/google', { mode: 'service', service_json: '{"type":"user"}' }), 400, /bukan kunci akun layanan/);
  await expectStatus(admin.put('/api/google', { mode: 'service', folder: 'bukan tautan!' }), 400, /tidak dikenali/);
  const t = await admin.post('/api/google/uji');
  assert.match(t.email, /iam\.gserviceaccount\.com/);

  await tu.call('POST', '/api/letters-in', letterForm('1'));
  await admin.post('/api/google/sinkron');
  const s = await waitSync();
  assert.equal(s.proses.galat, null, s.proses.galat);
  assert.equal(s.proses.hasil.file_baru, 1);
  assert.equal(s.lampiran.tersinkron, s.lampiran.total);
  const uploaded = [...g.files.values()].find((f) => f.name === 'surat-1.pdf')!;
  assert.match(g.pathOf(uploaded), /^Arsip Kantor\/Surat Masuk\/2026\/10 Oktober\/.+ Surat cadangan 1\/surat-1\.pdf$/);
  assert.match(uploaded.body.toString(), /isi 1/);

  assert.ok(s.spreadsheet_id);
  const sheet = g.sheets.get(s.spreadsheet_id)!;
  assert.deepEqual(sheet.sheets.map((x) => x.title), ['Ringkasan', 'Surat Masuk', 'Surat Keluar', 'Tugas', 'Instansi']);
  const masuk = sheet.values["'Surat Masuk'"];
  assert.equal(masuk[0][0], 'No. Agenda');
  assert.ok(masuk.some((r) => r.includes('Surat cadangan 1')));
  assert.ok(sheet.formats.some((f: any) => f.updateSheetProperties?.properties?.gridProperties?.frozenRowCount === 1));

  // Putaran kedua: tidak ada unggahan ulang.
  await admin.post('/api/google/sinkron');
  const s2 = await waitSync();
  assert.equal(s2.proses.hasil.file_baru, 0);
  assert.equal([...g.files.values()].filter((f) => f.name === 'surat-1.pdf').length, 1);
});

test('OAuth akun Google biasa: persetujuan, state diperiksa, refresh token tersimpan', async () => {
  await admin.put('/api/google', { mode: 'oauth', client_id: 'client-123.apps.googleusercontent.com', client_secret: 'rahasia', folder: `https://drive.google.com/drive/folders/${g.SHARED}` });
  const { url: consent } = await admin.post('/api/google/hubungkan');
  const state = new URL(consent).searchParams.get('state')!;
  assert.match(new URL(consent).searchParams.get('scope')!, /drive\.file/);
  const callback = (q: string) => fetch(`${url}/api/google/callback?${q}`, { headers: { Cookie: admin.cookie }, redirect: 'manual' });
  const bad = await callback('code=kode-benar&state=palsu');
  assert.equal(bad.status, 303);
  assert.match(decodeURIComponent(bad.headers.get('location')!.replace(/\+/g, ' ')), /galat=.*kedaluwarsa/);
  const ok = await callback(`code=kode-benar&state=${state}`);
  assert.equal(ok.status, 303);
  assert.match(decodeURIComponent(ok.headers.get('location')!.replace(/\+/g, ' ')), /berhasil=Terhubung ke Google sebagai tu\.kantor@gmail\.com/);
  const st = await admin.get('/api/google');
  assert.equal(st.terhubung, true);
  assert.equal(st.email, 'tu.kantor@gmail.com');
  assert.equal((await admin.post('/api/google/uji')).email, 'tu.kantor@gmail.com');
});

let firstBackup = '';
test('cadangan: dibuat, disalin ke Drive, diunduh sebagai tar.gz', async () => {
  const r = await admin.post('/api/cadangan', { ke_drive: true });
  firstBackup = r.cadangan.nama;
  assert.match(firstBackup, /^cadangan-\d{8}-\d{6}-manual\.tar\.gz$/);
  assert.equal(r.drive.ok, true);
  assert.ok(r.cadangan.tabel.letters_in >= 1);
  assert.equal(r.cadangan.tabel.sessions, undefined);
  assert.ok(r.cadangan.file >= 1);
  const inDrive = [...g.files.values()].find((f) => f.name === firstBackup)!;
  assert.match(g.pathOf(inDrive), /^Arsip Kantor\/Cadangan\//);
  const res = await admin.call('GET', `/api/cadangan/${firstBackup}`, undefined, { raw: true });
  assert.equal(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(zlib.gunzipSync(buf).includes('manifest.json'));
  await expectStatus(tu.get('/api/cadangan'), 403);
  await expectStatus(admin.get('/api/cadangan/..%2F..%2Fetc%2Fpasswd'), 404);
});

test('pulihkan: butuh kata konfirmasi, membuat cadangan pengaman, mengembalikan data dan file', async () => {
  const before = (await tu.get('/api/letters-in')).total;
  const extra = await tu.call('POST', '/api/letters-in', letterForm('2'));
  assert.equal((await tu.get('/api/letters-in')).total, before + 1);
  await expectStatus(admin.post(`/api/cadangan/${firstBackup}/pulihkan`, { konfirmasi: 'ya' }), 400, /PULIHKAN/);

  const r = await admin.post(`/api/cadangan/${firstBackup}/pulihkan`, { konfirmasi: 'pulihkan' });
  assert.match(r.pengaman, /sebelum-pemulihan/);
  // Semua sesi berakhir.
  await expectStatus(tu.get('/api/letters-in'), 401);
  [admin, tu] = await Promise.all(['admin', 'tu'].map((n) => new S(url, n).login()));
  const list = await tu.get('/api/letters-in');
  assert.equal(list.total, before);
  await expectStatus(tu.get(`/api/letters-in/${extra.id}`), 404);
  // Lampiran surat lama tetap dapat dibuka setelah folder file ditukar.
  const first = list.items.find((x: any) => x.perihal === 'Surat cadangan 1');
  const detail = await tu.get(`/api/letters-in/${first.id}`);
  const att = detail.attachments[0];
  const file = await tu.call('GET', `/api/files/${att.id}`, undefined, { raw: true });
  assert.equal(file.status, 200);
  assert.match(Buffer.from(await file.arrayBuffer()).toString(), /isi 1/);
  // Sambungan Google milik server ini dipertahankan; nomor ID berlanjut tanpa bentrok.
  assert.equal((await admin.get('/api/google')).terhubung, true);
  await tu.call('POST', '/api/letters-in', letterForm('3'));
  const ov = await admin.get('/api/cadangan');
  assert.ok(ov.cadangan.some((b: any) => b.jenis === 'sebelum-pemulihan'));
  // Cadangan pengaman berisi surat ke-2 yang sempat dibuat: pemulihan dapat dibatalkan.
  const safety = ov.cadangan.find((b: any) => b.jenis === 'sebelum-pemulihan');
  assert.equal(safety.tabel.letters_in, before + 1);
  const audit = await srv.pool.query("SELECT detail FROM audit_log WHERE aksi='CADANGAN_DIPULIHKAN'");
  assert.equal(audit.rows[0].detail.oleh, 'admin');
});

test('unggah cadangan dari komputer dan ambil dari Google Drive', async () => {
  const raw = await admin.call('GET', `/api/cadangan/${firstBackup}`, undefined, { raw: true });
  const bytes = Buffer.from(await raw.arrayBuffer());
  const send = (body: Buffer) => fetch(`${url}/api/cadangan/unggah`, { method: 'POST', headers: { 'X-Requested-With': 'surat-app', Cookie: admin.cookie, 'Content-Type': 'application/gzip' }, body: new Uint8Array(body) });
  const up = await send(bytes);
  assert.equal(up.status, 201);
  assert.equal((await up.json()).jenis, 'unggahan');
  const junk = await send(Buffer.from('bukan arsip'));
  assert.equal(junk.status, 400);
  const other = await send(zlib.gzipSync(Buffer.alloc(1024)));
  assert.equal(other.status, 400);

  const drive = await admin.get('/api/cadangan/drive');
  const item = drive.find((x: any) => x.nama === firstBackup);
  assert.ok(item);
  const fetched = await admin.post('/api/cadangan/drive', { file_id: item.id });
  assert.equal(fetched.jenis, 'drive');
  assert.ok(fetched.tabel.letters_in >= 1);
});

test('jadwal cadangan: diperiksa dan disimpan', async () => {
  await expectStatus(admin.put('/api/cadangan/jadwal', { otomatis: true, jam: '25:00', simpan: 7 }), 400);
  await expectStatus(admin.put('/api/cadangan/jadwal', { otomatis: true, jam: '02:00', simpan: 0 }), 400);
  const s = await admin.put('/api/cadangan/jadwal', { otomatis: true, jam: '02:30', simpan: 5, ke_drive: true });
  assert.deepEqual(s, { otomatis: true, jam: '02:30', simpan: 5, ke_drive: true });
  assert.equal((await admin.get('/api/cadangan')).jadwal.jam, '02:30');
});
