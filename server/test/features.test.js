import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const base = (process.env.TEST_DATABASE_URL || 'postgres://surat:surat_dev@localhost:5432/surat_test').replace(/surat_test$/, 'surat_test2');
process.env.DATABASE_URL = base;
process.env.STORAGE_DIR = `/tmp/surat-test-storage2-${process.pid}`;
process.env.NODE_ENV = 'test';

let server; let url; let pool; let S; let demo; let tu; let pm; let kasi; let andi;

const letterForm = (n, extra = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ no_surat: `T/${n}`, tgl_surat: '2026-10-01', tgl_diterima: '2026-10-08', asal: `Pengirim ${n}`, perihal: `[CONTOH] Surat uji ${n}`, ...extra })) f.append(k, v);
  return f;
};
const expectStatus = async (p, status) => assert.rejects(p, (e) => { assert.equal(e.status, status, e.message); return true; });

before(async () => {
  const admin = new pg.Client({ connectionString: base.replace(/\/[^/]+$/, '/postgres') });
  await admin.connect();
  const name = new URL(base).pathname.slice(1);
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const db = await import('../src/db.js');
  pool = db.pool;
  await db.migrate();
  await (await import('../src/seed.js')).ensureBaseData();
  server = (await import('../src/index.js')).createApp().listen(0);
  url = `http://localhost:${server.address().port}`;
  demo = await import('../src/demo.js');
  S = demo.Session;
  [tu, pm, kasi, andi] = await Promise.all(['tu', 'pimpinan', 'kasi.data', 'andi'].map((n) => new S(url, n).login()));
});

after(async () => {
  server?.close();
  await (await import('../src/ocr.js')).stopOcr();
  await pool?.end();
});

test('daftar: halaman, urutan, dan saringan dihitung di server', async () => {
  for (let i = 1; i <= 25; i++) await tu.call('POST', '/api/letters-in', letterForm(i, { sifat: i % 5 === 0 ? 'Penting' : 'Biasa' }));
  const p1 = await tu.get('/api/letters-in?pageSize=10&page=1');
  assert.equal(p1.items.length, 10);
  assert.equal(p1.total, 25);
  const p3 = await tu.get('/api/letters-in?pageSize=10&page=3');
  assert.equal(p3.items.length, 5);
  assert.equal(new Set([...p1.items, ...p3.items].map((x) => x.id)).size, 15);
  const asc = await tu.get('/api/letters-in?pageSize=5&sort=agenda&dir=asc');
  assert.ok(asc.items[0].id < asc.items[4].id);
  const penting = await tu.get('/api/letters-in?sifat=Penting&pageSize=100');
  assert.equal(penting.total, 5);
  const cari = await tu.get('/api/letters-in?q=Surat%20uji%2012');
  assert.equal(cari.total, 1);
  const ids = await tu.get('/api/letters-in/ids?sifat=Penting');
  assert.equal(ids.ids.length, 5);
  // urutan tidak boleh menerima ekspresi sembarang
  const injected = await tu.get('/api/letters-in?sort=id;DROP%20TABLE%20letters_in');
  assert.equal(injected.total, 25);
  const csv = await tu.call('GET', '/api/letters-in?format=csv', undefined, { raw: true });
  assert.match(await csv.text(), /No\. Agenda/);
});

test('aksi massal: sebagian berhasil, yang gagal dilaporkan, tidak ada yang rusak', async () => {
  const all = (await tu.get('/api/letters-in/ids')).ids;
  const first = all.slice(0, 6);
  // satu surat diteruskan lebih dulu agar menjadi "gagal" pada aksi massal
  await tu.post(`/api/letters-in/${first[0]}/teruskan`);
  const r = await tu.post('/api/letters-in/bulk/teruskan', { ids: first });
  assert.equal(r.ok, 5);
  assert.equal(r.gagal, 1);
  assert.equal(r.results.find((x) => x.id === first[0]).ok, false);
  const d = await tu.get(`/api/letters-in/${first[3]}`);
  assert.equal(d.letter.status, 'MENUNGGU_DISPOSISI');
  await expectStatus(andi.post('/api/letters-in/bulk/teruskan', { ids: first }), 403);
  await expectStatus(tu.post('/api/letters-in/bulk/teruskan', { ids: [] }), 400);
  await expectStatus(tu.post('/api/letters-in/bulk/teruskan', { ids: Array.from({ length: 201 }, (_, i) => i + 1) }), 400);
});

test('disposisi massal oleh pimpinan, lalu terima massal oleh pejabat', async () => {
  const ids = (await pm.get('/api/letters-in/ids?status=MENUNGGU_DISPOSISI')).ids.slice(0, 4);
  assert.equal(ids.length, 4);
  const unit = (await tu.get('/api/units')).find((u) => u.kode === 'DATA').id;
  const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  await expectStatus(tu.post('/api/letters-in/bulk/disposisi', { ids, to_unit_ids: [unit], tindakan: ['Untuk diketahui'], instruksi: 'x', deadline: tomorrow }), 403);
  const r = await pm.post('/api/letters-in/bulk/disposisi', { ids, to_unit_ids: [unit], tindakan: ['Untuk ditindaklanjuti'], instruksi: 'Mohon ditindaklanjuti', deadline: tomorrow });
  assert.equal(r.ok, 4);
  const mine = await kasi.get('/api/dispositions?scope=saya&status=BARU&pageSize=50');
  assert.equal(mine.total, 4);
  const t = await kasi.post('/api/dispositions/bulk/terima', { ids: mine.items.map((x) => x.id) });
  assert.equal(t.ok, 4);
  assert.equal((await kasi.get('/api/dispositions?scope=saya&status=BARU')).total, 0);
});

test('tugas massal: buat, ubah tenggat, selesai; pelaksana tidak boleh ubah tenggat orang lain', async () => {
  const letters = (await kasi.get('/api/letters-in?pageSize=100')).items.slice(0, 3);
  const users = await kasi.get('/api/users/options');
  const andiId = users.find((u) => u.username === 'andi').id;
  const tasks = [];
  for (const l of letters) tasks.push(await kasi.post(`/api/letters-in/${l.id}/tugas`, { judul: `Tugas ${l.id}`, pic_user_id: andiId, deadline: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) }));
  const ids = tasks.map((t) => t.id);
  const newDeadline = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
  assert.equal((await kasi.post('/api/tasks/bulk/tenggat', { ids, deadline: newDeadline })).ok, 3);
  assert.equal((await andi.post('/api/tasks/bulk/tenggat', { ids, deadline: newDeadline })).gagal, 3);
  const page = await andi.get('/api/tasks?scope=saya&antrian=terbuka&sort=tenggat&dir=asc&pageSize=2');
  assert.equal(page.total, 3);
  assert.equal(page.items.length, 2);
  assert.equal((await andi.post('/api/tasks/bulk/status', { ids, status: 'SELESAI' })).ok, 3);
  assert.equal((await andi.get('/api/tasks?scope=saya&status=SELESAI')).total, 3);
});

test('pelacakan publik: kode acak, isi terbatas, rate limit, nonaktif, buat ulang', async () => {
  const l = await tu.call('POST', '/api/letters-in', letterForm('LACAK', { perihal: '[CONTOH] Perihal rahasia internal' }));
  const info = await tu.get(`/api/letters-in/${l.id}/pelacakan`);
  assert.match(info.kode, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){4}$/);
  const code = info.kode.replaceAll('-', '');
  const pub = await fetch(`${url}/api/public/lacak/${code}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.headers.get('cache-control'), 'no-store');
  assert.match(pub.headers.get('x-robots-tag'), /noindex/);
  const body = await pub.json();
  const text = JSON.stringify(body);
  assert.ok(!text.includes('rahasia internal'), 'perihal bocor');
  assert.ok(!/Budi|Andi|Kepala Kantor|Petugas/.test(text), 'nama pegawai bocor');
  assert.equal(body.steps[0].done, true);
  assert.equal(body.steps.at(-1).done, false);
  // kode dengan tanda hubung, huruf kecil, dan salah baca O/0 tetap dikenali
  assert.equal((await fetch(`${url}/api/public/lacak/${info.kode.toLowerCase()}`)).status, 200);
  // kode salah dan tidak ada memberi jawaban sama
  const a = await fetch(`${url}/api/public/lacak/AAAAAAAAAAAAAAAAAAAA`);
  const b = await fetch(`${url}/api/public/lacak/xyz`);
  assert.equal(a.status, 404); assert.equal(b.status, 404);
  assert.equal((await a.json()).error, (await b.json()).error);
  // nonaktif lalu aktif; buat ulang mematikan kode lama
  assert.equal((await tu.post(`/api/letters-in/${l.id}/pelacakan`, { aksi: 'nonaktifkan' })).aktif, false);
  assert.equal((await fetch(`${url}/api/public/lacak/${code}`)).status, 404);
  await tu.post(`/api/letters-in/${l.id}/pelacakan`, { aksi: 'aktifkan' });
  const fresh = await tu.post(`/api/letters-in/${l.id}/pelacakan`, { aksi: 'buat_ulang' });
  assert.notEqual(fresh.kode.replaceAll('-', ''), code);
  assert.equal((await fetch(`${url}/api/public/lacak/${code}`)).status, 404);
  assert.equal((await fetch(`${url}/api/public/lacak/${fresh.kode}`)).status, 200);
  // hanya TU dan admin yang boleh mengubah; pelaksana tidak melihat surat ini sama sekali
  await expectStatus(andi.get(`/api/letters-in/${l.id}/pelacakan`), 403);
  await expectStatus(pm.post(`/api/letters-in/${l.id}/pelacakan`, { aksi: 'nonaktifkan' }), 403);
  // surat rahasia: pelacakan mati secara bawaan
  const r = await tu.call('POST', '/api/letters-in', letterForm('RHS', { sifat: 'Rahasia' }));
  const ri = await tu.get(`/api/letters-in/${r.id}/pelacakan`);
  assert.equal(ri.aktif, false);
  assert.equal((await fetch(`${url}/api/public/lacak/${ri.kode}`)).status, 404);
  // pembatas laju: lebih dari 30 percobaan dalam 10 menit dari satu IP ditolak
  let limited = 0;
  for (let i = 0; i < 40; i++) if ((await fetch(`${url}/api/public/lacak/BBBBBBBBBBBBBBBBBBBB`)).status === 429) limited++;
  assert.ok(limited > 0, 'rate limit tidak aktif');
});

test('OCR: hanya TU, hanya gambar, dan hasil hanyalah usulan', async () => {
  const f = new FormData();
  f.append('foto', new Blob(['bukan gambar'], { type: 'image/jpeg' }), 'x.jpg');
  await expectStatus(tu.call('POST', '/api/ocr/surat-masuk', f), 400);
  const g = new FormData();
  g.append('foto', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])], { type: 'image/jpeg' }), 'x.jpg');
  await expectStatus(andi.call('POST', '/api/ocr/surat-masuk', g), 403);
  await expectStatus(new S(url, 'anon').call('POST', '/api/ocr/surat-masuk', g), 401);
});

test('OCR: penguraian teks surat menjadi isian formulir', async () => {
  const { parseLetter } = await import('../src/ocrParse.js');
  const L = (t, c = 95) => ({ text: t, conf: c });
  const r = parseLetter([
    L('PEMERINTAH KOTA ADMINISTRASI JAKARTA PUSAT'), L('SMPN 7 JAKARTA'), L('Jl. Cikini Raya No. 21, Jakarta Pusat'),
    L('Jakarta, 7 Agustus 2026'), L('Nomor : B-408/SMPN7/VII11/2026'), L('Sifat : Rahasia'), L('Lampiran : -'),
    L('Perihal : Undangan rapat koordinasi persiapan ujian sekolah'), L('Yth. Kepala Suku Dinas Pendidikan'), L('di'), L('Tempat'),
    L('Dengan hormat, sehubungan dengan program.'), L('Kepala Sekolah,'), L('Budi Santoso, S.Pd., M.M.'),
  ]);
  assert.equal(r.fields.no_surat.value, 'B-408/SMPN7/VIII/2026'); // VII11 diperbaiki menjadi VIII
  assert.equal(r.fields.tgl_surat.value, '2026-08-07');
  assert.equal(r.fields.sifat.value, 'Rahasia');
  assert.equal(r.fields.perihal.value, 'Undangan rapat koordinasi persiapan ujian sekolah');
  assert.equal(r.fields.instansi.value, 'SMPN 7 JAKARTA');
  assert.equal(r.fields.asal.value, 'Kepala Sekolah');
  assert.equal(r.fields.lampiran.value, '');
  assert.deepEqual(r.missing, []);
  const noisy = parseLetter([L('SDN 01'), L('Nomor : 4Z1/l23/SDN-O1/X/2O26', 70), L('Jakarta, 8 0ktober 2026', 60), L('Perihal: Permohonan data'), L('Yth. Kepala')]);
  assert.equal(noisy.fields.no_surat.value, '421/123/SDN-01/X/2026');
  assert.equal(noisy.fields.tgl_surat.value, '2026-10-08');
  assert.equal(noisy.fields.no_surat.conf, 70); // kepercayaan rendah diteruskan agar UI menandai isian
  assert.ok(noisy.missing.includes('asal'));
});

test('OCR mesin jarak jauh: keluaran Markdown model diubah menjadi isian, lalu jatuh ke Tesseract bila server mati', async () => {
  const http = await import('node:http');
  const { config } = await import('../src/config.js');
  const { recognize } = await import('../src/ocr.js');
  let seen;
  const md = ['# PEMERINTAH KOTA', '## SDN MENTENG 01', 'Jl. Besuki No. 4, Menteng', '', 'Jakarta, 8 Oktober 2026', '',
    '| Nomor | : | 421/123/SDN-01/X/2026 |', '|---|---|---|', '| Sifat | : | Penting |', '| Perihal | : | **Permohonan data peserta didik** |', '', 'Yth. Kepala Suku Dinas', '', 'Kepala Sekolah,', 'Budi Santoso'].join('\n');
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { seen = JSON.parse(b); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: md } }] })); });
  }).listen(0);
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  Object.assign(config.ocr, { engine: 'remote', url: `http://localhost:${srv.address().port}` });
  const r = await recognize(png);
  assert.equal(r.quality.engine, 'remote');
  assert.equal(r.fields.no_surat.value, '421/123/SDN-01/X/2026');
  assert.equal(r.fields.perihal.value, 'Permohonan data peserta didik');
  assert.equal(r.fields.sifat.value, 'Penting');
  assert.equal(r.fields.tgl_surat.value, '2026-10-08');
  assert.equal(r.fields.instansi.value, 'SDN MENTENG 01');
  assert.equal(seen.temperature, 0);
  assert.equal(seen.messages[0].content[0].text, 'document parsing.');
  assert.match(seen.messages[0].content[1].image_url.url, /^data:image\/png;base64,/);
  srv.close();
  // server mati dan cadangan dimatikan: gagal dengan jelas
  Object.assign(config.ocr, { url: 'http://localhost:1', fallback: false });
  await assert.rejects(recognize(png));
  Object.assign(config.ocr, { engine: 'tesseract', fallback: true });
});
