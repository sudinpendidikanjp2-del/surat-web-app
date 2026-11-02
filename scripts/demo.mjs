/**
 * Skenario contoh lewat API (PRD bagian 88). Dipakai oleh `npm run seed:demo` dan uji integrasi.
 * Jalankan terhadap server yang sudah menyala: APP_URL=http://localhost:3000 node scripts/demo.mjs
 * Semua surat contoh diberi awalan "[CONTOH]" pada perihal agar tidak tertukar dengan data nyata.
 */
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

export class Session {
  constructor(base, name) { this.base = base; this.name = name; this.cookie = ''; }

  async call(method, url, body, { raw = false } = {}) {
    const headers = { 'X-Requested-With': 'surat-app' };
    if (this.cookie) headers.Cookie = this.cookie;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(this.base + url, { method, headers, body: payload });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    if (raw) return res;
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
    if (!res.ok) { const e = new Error(`${this.name} ${method} ${url} -> ${res.status} ${data?.error || ''}`); e.status = res.status; throw e; }
    return data;
  }
  get = (u) => this.call('GET', u);
  post = (u, b) => this.call('POST', u, b ?? {});
  put = (u, b) => this.call('PUT', u, b);
  login = async (password = process.env.SEED_PASSWORD || 'surat12345') => { await this.post('/api/auth/login', { username: this.name, password }); return this; };
}

export const form = (obj, files = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) if (v != null) f.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  for (const [k, name] of Object.entries(files)) f.append(k, new Blob([PDF], { type: 'application/pdf' }), name);
  return f;
};

const iso = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

export async function runDemo(base, log = console.log) {
  const s = Object.fromEntries(await Promise.all(['tu', 'pimpinan', 'kasi.data', 'andi', 'budi'].map((n) => new Session(base, n).login().then((x) => [n, x]))));
  const users = await s.tu.get('/api/users/options');
  const byNama = (n) => users.find((u) => u.nama === n).id;
  const units = await s.tu.get('/api/units');
  const unitData = units.find((u) => u.kode === 'DATA').id;

  const created = await s.tu.call('POST', '/api/letters-in', form({
    no_surat: '421/123/SD-A/X/2026', tgl_surat: iso(-2), tgl_diterima: iso(0), asal: 'Kepala Sekolah A', instansi: 'Sekolah A',
    alamat: 'Jl. Contoh No. 1', perihal: '[CONTOH] Permohonan data peserta didik', sifat: 'Penting', prioritas: 'Tinggi', lampiran: '1 berkas',
  }, { files: 'surat-sekolah-a.pdf' }));
  log(`Surat masuk ${created.no_agenda}`);
  await s.tu.post(`/api/letters-in/${created.id}/teruskan`);
  await s.pimpinan.post(`/api/letters-in/${created.id}/disposisi`, {
    to_unit_ids: [unitData], tindakan: ['Untuk ditindaklanjuti', 'Untuk disiapkan jawaban'],
    instruksi: 'Mohon ditindaklanjuti dan disiapkan jawaban.', deadline: iso(4), prioritas: 'Tinggi',
  });
  let d = await s['kasi.data'].get(`/api/letters-in/${created.id}`);
  await s['kasi.data'].post(`/api/dispositions/${d.dispositions[0].id}/terima`);
  const t1 = await s['kasi.data'].post(`/api/letters-in/${created.id}/tugas`, { judul: 'Menyiapkan data peserta didik', pic_user_id: byNama('Andi'), deadline: iso(2), prioritas: 'Tinggi', disposition_id: d.dispositions[0].id, checklist: ['Rekap per kelas', 'Validasi NISN'] });
  const t2 = await s['kasi.data'].post(`/api/letters-in/${created.id}/tugas`, { judul: 'Menyusun draft surat balasan', pic_user_id: byNama('Budi'), deadline: iso(3), prioritas: 'Normal', disposition_id: d.dispositions[0].id });
  await s.andi.call('POST', `/api/tasks/${t1.id}/update`, form({ progress: 70, catatan: 'Data kelas 1 sampai 5 selesai direkap. Menunggu data kelas 6.' }, { files: 'rekap-data.pdf' }));
  await s.andi.call('POST', `/api/tasks/${t1.id}/update`, form({ status: 'SELESAI', catatan: 'Semua data lengkap.' }));
  const tpl = (await s.budi.get('/api/templates')).find((t) => t.kode === 'pengantar');
  const tdet = await s.budi.get(`/api/templates/${tpl.id}`);
  const tvId = tdet.versions.find((v) => v.aktif).id;
  const out = await s.budi.post('/api/letters-out', {
    template_version_id: tvId, letter_in_id: created.id, perihal: '[CONTOH] Penyampaian data peserta didik', tujuan: 'Kepala Sekolah A',
    tgl_surat: iso(0), penandatangan_id: byNama('Kepala Kantor'),
    fields: { alamat_penerima: 'Jl. Contoh No. 1', lampiran: '1 berkas', isi_surat: 'Menindaklanjuti surat Saudara, bersama ini kami sampaikan data peserta didik yang diminta.' },
  });
  await s.budi.post(`/api/letters-out/${out.id}/ajukan`, {});
  await s.pimpinan.post(`/api/letters-out/${out.id}/keputusan`, { aksi: 'setuju' });
  await s.tu.call('POST', `/api/letters-out/${out.id}/ttd`, form({}, { file: 'surat-ttd.pdf' }));
  await s.tu.post(`/api/letters-out/${out.id}/kirim`, { metode: 'Email' });
  await s.tu.post(`/api/letters-out/${out.id}/selesai`);
  await s.andi.post(`/api/letters-in/${created.id}/komentar`, { teks: '@kasi.data data sudah dikirim ke pimpinan.' }).catch(() => {});
  await s['kasi.data'].post(`/api/tasks/${t2.id}/update`, { status: 'SELESAI', catatan: 'Draft sudah dibuat dan dikirim.' }).catch(async () => {
    await s.budi.call('POST', `/api/tasks/${t2.id}/update`, form({ status: 'SELESAI', catatan: 'Draft sudah dibuat dan dikirim.' }));
  });
  await s['kasi.data'].call('POST', `/api/letters-in/${created.id}/konfirmasi`, form({ tanggal: iso(0), metode: 'Email', pihak: 'Kepala Sekolah A', hasil: 'Surat balasan diterima baik.' }));
  await s['kasi.data'].post(`/api/letters-in/${created.id}/selesaikan`);
  await s.tu.post(`/api/letters-in/${created.id}/arsipkan`);

  // surat kedua dibiarkan di tengah proses supaya dashboard punya variasi
  const second = await s.tu.call('POST', '/api/letters-in', form({
    no_surat: '005/77/DISDIK/X/2026', tgl_surat: iso(-1), tgl_diterima: iso(0), asal: 'Sekretaris Dinas', instansi: 'Dinas',
    perihal: '[CONTOH] Undangan rapat koordinasi', sifat: 'Segera', prioritas: 'Mendesak',
  }, { files: 'undangan.pdf' }));
  await s.tu.post(`/api/letters-in/${second.id}/teruskan`);
  log(`Surat masuk ${second.no_agenda} menunggu disposisi`);
  return { letterId: created.id, outId: out.id, task1: t1.id, secondId: second.id, sessions: s, unitData, users };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runDemo(process.env.APP_URL || 'http://localhost:3000');
}
