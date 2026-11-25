/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, test } from 'vitest';
import assert from 'node:assert/strict';
import type pg from 'pg';
import * as demoModule from '../../scripts/demo.mjs';
import { startServer, type TestServer } from './support/server';

const demo: any = demoModule;
const S: any = demo.Session;
let srv: TestServer; let url: string; let pool: pg.Pool;



beforeAll(async () => {
  srv = await startServer('surat_test');
  url = srv.url;
  pool = srv.pool;
});

afterAll(async () => {
  await srv?.stop();
});

const outForm = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v); return f; };
const expectStatus = async (promise: Promise<unknown>, status: number) => {
  await assert.rejects(promise, (e: any) => { assert.equal(e.status, status, e.message); return true; });
};

test('autentikasi: tanpa sesi ditolak, tanpa header CSRF ditolak', async () => {
  const anon = new S(url, 'anon');
  await expectStatus(anon.get('/api/letters-in'), 401);
  const tu = await new S(url, 'tu').login();
  const res = await fetch(`${url}/api/letters-in/1/teruskan`, { method: 'POST', headers: { Cookie: tu.cookie, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 403);
  await expectStatus(new S(url, 'tu').login('salah'), 401);
});

test('login: X-Forwarded-For palsu tidak menembus batas percobaan (TRUST_PROXY mati)', async () => {
  const attempt = (i: number) => fetch(`${url}/api/auth/login`, {
    method: 'POST',
    headers: { 'X-Requested-With': 'surat-app', 'Content-Type': 'application/json', 'X-Forwarded-For': `198.51.100.${i}`, 'X-Real-IP': `198.51.100.${i}` },
    body: JSON.stringify({ username: 'penyerang-uji', password: `tebakan-${i}` }),
  });
  const statuses: number[] = [];
  for (let i = 1; i <= 11; i++) statuses.push((await attempt(i)).status);
  assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));
  assert.equal(statuses[10], 429);
  // Header palsu tidak tercatat sebagai alamat di catatan kegiatan.
  const logged = await srv.pool.query("SELECT DISTINCT ip FROM audit_log WHERE aksi='LOGIN_GAGAL' AND entitas_id='penyerang-uji'");
  assert.deepEqual(logged.rows.map((r: { ip: string | null }) => r.ip), [null]);
});

test('skenario PRD penuh: dari surat diterima sampai arsip, dan relasi masuk-keluar', async () => {
  const r = await demo.runDemo(url, () => {});
  const tu = r.sessions.tu;
  const d = await tu.get(`/api/letters-in/${r.letterId}`);
  assert.equal(d.letter.status, 'DIARSIPKAN');
  assert.equal(d.percent, 100);
  assert.equal(d.outs.length, 1);
  const out = await tu.get(`/api/letters-out/${r.outId}`);
  assert.equal(out.letter.status, 'DIKIRIM');
  assert.equal(out.signed, true);
  assert.equal(out.asal.id, r.letterId);
  assert.match(out.letter.nomor_surat, /^421\/001\/Sudin-JP2\/[IVX]+\/\d{4}$/);
  const tl = await tu.get(`/api/letters-in/${r.letterId}/timeline`);
  assert.ok(tl.length >= 12, `timeline ${tl.length}`);
  assert.ok(tl.some((e) => e.tipe === 'disposisi') && tl.some((e) => e.tipe === 'surat_keluar') && tl.some((e) => e.tipe === 'kirim'));
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
  // Surat keluar: tidak bisa dikirim sebelum bernomor dan sebelum ada pindaian bertanda tangan.
  const out = await tu.call('POST', '/api/letters-out', outForm({ nomor_mode: 'nanti', perihal: 'Uji', tujuan: 'Kepala', tgl_surat: '2026-10-08' }));
  await expectStatus(tu.post(`/api/letters-out/${out.id}/kirim`, { metode: 'Email' }), 400);
  await tu.put(`/api/letters-out/${out.id}`, { nomor_mode: 'manual', nomor_surat: 'UJI/1/2026', perihal: 'Uji', tujuan: 'Kepala', tgl_surat: '2026-10-08' });
  await expectStatus(tu.post(`/api/letters-out/${out.id}/kirim`, { metode: 'Email' }), 400);
  const scan = new FormData(); scan.append('kategori', 'TTD'); scan.append('files', new Blob(['%PDF-1.4 ttd']), 'ttd.pdf');
  await tu.call('POST', `/api/letters-out/${out.id}/lampiran`, scan);
  await tu.post(`/api/letters-out/${out.id}/kirim`, { metode: 'Email', tanggal: '2026-10-09' });
  const sent = await tu.get(`/api/letters-out/${out.id}`);
  assert.equal(sent.letter.status, 'DIKIRIM');
  await expectStatus(tu.post(`/api/letters-out/${out.id}/kirim`, { metode: 'Email' }), 409);
  await expectStatus(tu.put(`/api/letters-out/${out.id}`, { nomor_mode: 'tetap', perihal: 'X', tujuan: 'Y', tgl_surat: '2026-10-08' }), 403);
  // Nomor yang sudah dipakai ditolak; pembatalan butuh alasan; tidak ada lagi alur persetujuan.
  await expectStatus(tu.call('POST', '/api/letters-out', outForm({ nomor_mode: 'manual', nomor_surat: 'uji/1/2026', perihal: 'Ganda', tujuan: 'K', tgl_surat: '2026-10-08' })), 409);
  const b = await tu.call('POST', '/api/letters-out', outForm({ nomor_mode: 'nanti', perihal: 'Batal', tujuan: 'K', tgl_surat: '2026-10-08' }));
  await expectStatus(tu.post(`/api/letters-out/${b.id}/batal`, {}), 400);
  await tu.post(`/api/letters-out/${b.id}/batal`, { alasan: 'Tidak jadi' });
  assert.equal((await tu.get(`/api/letters-out/${b.id}`)).letter.status, 'DIBATALKAN');
  await expectStatus(pm.post(`/api/letters-out/${b.id}/keputusan`, { aksi: 'setuju' }), 404);
});

test('penomoran: nomor otomatis bersamaan tidak menghasilkan nomor ganda', async () => {
  const tu = await new S(url, 'tu').login();
  const made = await Promise.all(Array.from({ length: 8 }, (_, i) =>
    tu.call('POST', '/api/letters-out', outForm({ nomor_mode: 'otomatis', perihal: `Uji ${i}`, tujuan: 'Kepala', tgl_surat: '2026-10-08' }))));
  const nomor = made.map((x: any) => x.nomor_surat);
  assert.equal(new Set(nomor).size, nomor.length, nomor.join(', '));
  assert.ok(nomor.every((n: string) => /^421\/\d{3}\/Sudin-JP2\/X\/2026$/.test(n)), nomor.join(', '));
  // Pimpinan tidak mencatat surat keluar (penulis: TU, pejabat, pelaksana, admin).
  const pm = await new S(url, 'pimpinan').login();
  await expectStatus(pm.call('POST', '/api/letters-out', outForm({ nomor_mode: 'nanti', perihal: 'X', tujuan: 'Y', tgl_surat: '2026-10-08' })), 403);
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
  const { runReminders: run } = await import('@/server/application/reminders');
  const { deps } = await import('@/server/container');
  const runReminders = () => run(deps());
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
  const { addWorkdays, slaIndicator } = await import('@/domain/sla');
  assert.equal(addWorkdays('2026-10-09', 1), '2026-10-12'); // Jumat + 1 hari kerja = Senin
  assert.equal(addWorkdays('2026-10-08', 5), '2026-10-15');
  assert.equal(slaIndicator('2026-10-06', new Date('2026-10-08T03:00:00Z')).level, 'late');
  assert.equal(slaIndicator('2026-10-09', new Date('2026-10-08T03:00:00Z')).level, 'warn');
  assert.equal(slaIndicator('2026-10-20', new Date('2026-10-08T03:00:00Z')).level, 'ok');
});

test('kebijakan privasi dan ketentuan layanan: publik, memuat nama kantor, boleh diindeks', async () => {
  const kantor = (await srv.pool.query("SELECT value->>'nama' AS nama FROM settings WHERE key='instansi'")).rows[0].nama;
  for (const [path, judul] of [['/policy', 'Kebijakan Privasi'], ['/tos', 'Ketentuan Layanan']]) {
    const res = await fetch(`${url}${path}`, { redirect: 'manual' });
    assert.equal(res.status, 200, path);
    const html = await res.text();
    assert.match(html, new RegExp(judul));
    assert.ok(html.includes(kantor), `${path} harus menyebut ${kantor}`);
    assert.equal(res.headers.get('x-robots-tag'), null, `${path} tidak boleh noindex`);
    assert.match(res.headers.get('content-security-policy') || '', /nonce-/);
  }
  const policy = await (await fetch(`${url}/policy`)).text();
  assert.match(policy, /Limited Use/);
  assert.match(policy, /drive\.file/);
  // Tautan tersedia dari halaman masuk; halaman lain tetap noindex.
  const masuk = await fetch(`${url}/masuk`);
  assert.equal(masuk.headers.get('x-robots-tag'), 'noindex, nofollow');
  const masukHtml = await masuk.text();
  assert.match(masukHtml, /href="\/policy"/);
  assert.match(masukHtml, /href="\/tos"/);
});
