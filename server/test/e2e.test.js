import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

// Database uji dibuat ulang setiap kali agar hasilnya deterministik.
const base = process.env.TEST_DATABASE_URL || 'postgres://surat:surat_dev@localhost:5432/surat_test';
process.env.DATABASE_URL = base;
process.env.STORAGE_DIR = `/tmp/surat-test-storage-${process.pid}`;
process.env.NODE_ENV = 'test';

let server; let url; let pool; let S; let demo;

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
  const { ensureBaseData } = await import('../src/seed.js');
  await ensureBaseData();
  const { createApp } = await import('../src/index.js');
  server = createApp().listen(0);
  url = `http://localhost:${server.address().port}`;
  demo = await import('../src/demo.js');
  S = demo.Session;
});

after(async () => {
  server?.close();
  await pool?.end();
});

const expectStatus = async (promise, status) => {
  await assert.rejects(promise, (e) => { assert.equal(e.status, status, e.message); return true; });
};

test('autentikasi: tanpa sesi ditolak, tanpa header CSRF ditolak', async () => {
  const anon = new S(url, 'anon');
  await expectStatus(anon.get('/api/letters-in'), 401);
  const tu = await new S(url, 'tu').login();
  const res = await fetch(`${url}/api/letters-in/1/teruskan`, { method: 'POST', headers: { Cookie: tu.cookie, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 403);
  await expectStatus(new S(url, 'tu').login('salah'), 401);
});

test('skenario PRD penuh: dari surat diterima sampai arsip, dan relasi masuk-keluar', async () => {
  const r = await demo.runDemo(url, () => {});
  const tu = r.sessions.tu;
  const d = await tu.get(`/api/letters-in/${r.letterId}`);
  assert.equal(d.letter.status, 'DIARSIPKAN');
  assert.equal(d.percent, 100);
  assert.equal(d.outs.length, 1);
  const out = await tu.get(`/api/letters-out/${r.outId}`);
  assert.equal(out.letter.status, 'SELESAI');
  assert.equal(out.asal.id, r.letterId);
  assert.match(out.letter.nomor_surat, /^421\/001\/Sudin-JP2\/[IVX]+\/\d{4}$/);
  const tl = await tu.get(`/api/letters-in/${r.letterId}/timeline`);
  assert.ok(tl.length >= 12, `timeline ${tl.length}`);
  assert.ok(tl.some((e) => e.tipe === 'disposisi') && tl.some((e) => e.tipe === 'approval'));
});

test('hak akses: pelaksana tidak melihat surat yang bukan miliknya', async () => {
  const tu = await new S(url, 'tu').login();
  const f = new FormData();
  for (const [k, v] of Object.entries({ no_surat: 'R/1', tgl_surat: '2026-10-01', tgl_diterima: '2026-10-08', asal: 'X', perihal: '[CONTOH] Rahasia', sifat: 'Rahasia' })) f.append(k, v);
  const l = await tu.call('POST', '/api/letters-in', f);
  const andi = await new S(url, 'andi').login();
  await expectStatus(andi.get(`/api/letters-in/${l.id}`), 403);
  const viewer = await new S(url, 'viewer').login();
  await expectStatus(viewer.get(`/api/letters-in/${l.id}`), 403);
  await expectStatus(andi.post(`/api/letters-in/${l.id}/teruskan`), 403);
  await expectStatus(andi.post(`/api/letters-in/${l.id}/disposisi`, { to_user_ids: [1], tindakan: ['Untuk diketahui'], instruksi: 'x', deadline: '2099-01-01' }), 403);
});

test('alur wajib dipatuhi: tidak bisa selesai tanpa syarat, tidak bisa setujui tanpa diajukan', async () => {
  const tu = await new S(url, 'tu').login();
  const pm = await new S(url, 'pimpinan').login();
  const f = new FormData();
  for (const [k, v] of Object.entries({ no_surat: 'R/2', tgl_surat: '2026-10-01', tgl_diterima: '2026-10-08', asal: 'Y', perihal: '[CONTOH] Uji alur' })) f.append(k, v);
  const l = await tu.call('POST', '/api/letters-in', f);
  await expectStatus(tu.post(`/api/letters-in/${l.id}/selesaikan`), 400);
  await expectStatus(tu.post(`/api/letters-in/${l.id}/arsipkan`), 409);
  const tpl = (await tu.get('/api/templates')).find((t) => t.kode === 'nota-dinas');
  const tv = (await tu.get(`/api/templates/${tpl.id}`)).versions[0].id;
  const out = await tu.post('/api/letters-out', { template_version_id: tv, perihal: 'Uji', tujuan: 'Kepala', tgl_surat: '2026-10-08', fields: {} });
  await expectStatus(pm.post(`/api/letters-out/${out.id}/keputusan`, { aksi: 'setuju' }), 409);
  await expectStatus(tu.post(`/api/letters-out/${out.id}/ajukan`), 400);
});

test('penomoran: persetujuan bersamaan tidak menghasilkan nomor ganda', async () => {
  const tu = await new S(url, 'tu').login();
  const pm = await new S(url, 'pimpinan').login();
  const tpl = (await tu.get('/api/templates')).find((t) => t.kode === 'nota-dinas');
  const tv = (await tu.get(`/api/templates/${tpl.id}`)).versions[0].id;
  const ids = [];
  for (let i = 0; i < 8; i++) {
    const o = await tu.post('/api/letters-out', {
      template_version_id: tv, perihal: `Uji ${i}`, tujuan: 'Kepala', tgl_surat: '2026-10-08', penandatangan_id: (await tu.get('/api/users/options')).find((u) => u.role === 'pimpinan').id,
      fields: { dari: 'Sekretariat', isi: 'Isi', penutup: 'Terima kasih' },
    });
    await tu.post(`/api/letters-out/${o.id}/ajukan`);
    ids.push(o.id);
  }
  await Promise.all(ids.map((id) => pm.post(`/api/letters-out/${id}/keputusan`, { aksi: 'setuju' })));
  const nomor = await Promise.all(ids.map(async (id) => (await tu.get(`/api/letters-out/${id}`)).letter.nomor_surat));
  assert.equal(new Set(nomor).size, ids.length, nomor.join(', '));
});

test('unggahan: ekstensi berbahaya dan isi tidak sesuai ditolak; file hanya lewat endpoint berizin', async () => {
  const tu = await new S(url, 'tu').login();
  const mk = (name, bytes) => { const f = new FormData(); for (const [k, v] of Object.entries({ no_surat: 'U/1', tgl_surat: '2026-10-01', tgl_diterima: '2026-10-08', asal: 'Z', perihal: '[CONTOH] Unggah' })) f.append(k, v); f.append('files', new Blob([bytes]), name); return f; };
  await expectStatus(tu.call('POST', '/api/letters-in', mk('x.exe', 'MZ')), 400);
  await expectStatus(tu.call('POST', '/api/letters-in', mk('x.pdf', 'bukan pdf')), 400);
  const ok = await tu.call('POST', '/api/letters-in', mk('x.pdf', '%PDF-1.4 ok'));
  const d = await tu.get(`/api/letters-in/${ok.id}`);
  const anon = await fetch(`${url}/api/files/${d.attachments[0].id}`);
  assert.equal(anon.status, 401);
  const got = await fetch(`${url}/api/files/${d.attachments[0].id}`, { headers: { Cookie: tu.cookie } });
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('x-content-type-options'), 'nosniff');
});

test('audit log dan timeline tidak dapat diubah atau dihapus', async () => {
  await assert.rejects(pool.query('DELETE FROM audit_log'), /tidak dapat diubah/);
  await assert.rejects(pool.query(`UPDATE audit_log SET aksi='x'`), /tidak dapat diubah/);
  await assert.rejects(pool.query(`UPDATE events SET teks='x'`), /tidak dapat diubah/);
  const n = (await pool.query('SELECT count(*)::int AS n FROM audit_log')).rows[0].n;
  assert.ok(n > 20);
});

test('pengingat tenggat: H-1 dan terlambat membuat notifikasi tanpa duplikat, terlambat dieskalasi', async () => {
  const { runReminders } = await import('../src/jobs.js');
  const tasks = await pool.query(`SELECT count(*)::int AS n FROM tasks WHERE status='SELESAI'`);
  assert.ok(tasks.rows[0].n >= 1);
  const tu = await new S(url, 'tu').login();
  const kasi = await new S(url, 'kasi.data').login();
  const pm = await new S(url, 'pimpinan').login();
  const f = new FormData();
  for (const [k, v] of Object.entries({ no_surat: 'P/1', tgl_surat: '2026-10-01', tgl_diterima: '2026-10-08', asal: 'P', perihal: '[CONTOH] Pengingat' })) f.append(k, v);
  const l = await tu.call('POST', '/api/letters-in', f);
  await tu.post(`/api/letters-in/${l.id}/teruskan`);
  const users = await tu.get('/api/users/options');
  const unit = (await tu.get('/api/units')).find((u) => u.kode === 'DATA').id;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await pm.post(`/api/letters-in/${l.id}/disposisi`, { to_unit_ids: [unit], tindakan: ['Untuk ditindaklanjuti'], instruksi: 'Uji', deadline: tomorrow });
  const d = await kasi.get(`/api/letters-in/${l.id}`);
  await kasi.post(`/api/dispositions/${d.dispositions[0].id}/terima`);
  const andi = users.find((u) => u.username === 'andi').id;
  const t = await kasi.post(`/api/letters-in/${l.id}/tugas`, { judul: 'Tugas pengingat', pic_user_id: andi, deadline: tomorrow });
  await runReminders();
  await runReminders();
  const before = (await pool.query(`SELECT count(*)::int AS n FROM notifications WHERE dedupe_key LIKE $1`, [`rem:${t.id}:H1:%`])).rows[0].n;
  assert.equal(before, 1);
  // tenggat dimundurkan ke kemarin lewat SQL (tabel tugas boleh diubah, hanya audit dan timeline yang terkunci)
  await pool.query(`UPDATE tasks SET deadline = current_date - 2 WHERE id=$1`, [t.id]);
  await runReminders();
  const late = (await pool.query(`SELECT user_id FROM notifications WHERE dedupe_key LIKE $1`, [`esk:${t.id}:%`])).rows;
  const pimpinanId = users.find((u) => u.role === 'pimpinan').id;
  assert.ok(late.some((x) => x.user_id === pimpinanId), 'pimpinan menerima eskalasi');
});

test('SLA: hari kerja melewati akhir pekan', async () => {
  const { addWorkdays, slaIndicator } = await import('../src/sla.js');
  assert.equal(addWorkdays('2026-10-09', 1), '2026-10-12'); // Jumat + 1 hari kerja = Senin
  assert.equal(addWorkdays('2026-10-08', 5), '2026-10-15');
  assert.equal(slaIndicator('2026-10-06', new Date('2026-10-08T03:00:00Z')).level, 'late');
  assert.equal(slaIndicator('2026-10-09', new Date('2026-10-08T03:00:00Z')).level, 'warn');
  assert.equal(slaIndicator('2026-10-20', new Date('2026-10-08T03:00:00Z')).level, 'ok');
});
