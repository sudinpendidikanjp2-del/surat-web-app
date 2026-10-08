import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, qs, upload } from '../api.js';
import { useUser, can } from '../auth.jsx';
import { Async, Empty, Field, FilePicker, Input, PageHead, Select, Sla, Stamp, StatusIn, Textarea, useAction } from '../ui.jsx';
import { fmtDate, PRIORITAS, SIFAT, STATUS_IN, todayIso } from '../format.js';

export function LettersIn() {
  const user = useUser();
  const [sp, setSp] = useSearchParams();
  const f = { q: sp.get('q') || '', status: sp.get('status') || '', sifat: sp.get('sifat') || '', antrian: sp.get('antrian') || '', from: sp.get('from') || '', to: sp.get('to') || '' };
  const set = (patch) => {
    const next = { ...f, ...patch };
    const p = {};
    for (const [k, v] of Object.entries(next)) if (v) p[k] = v;
    setSp(p, { replace: true });
  };
  const q = useQuery({ queryKey: ['letters-in', f], queryFn: () => get(`/letters-in${qs(f)}`) });
  const chips = [
    { label: 'Semua', patch: { status: '', antrian: '' }, on: !f.status && !f.antrian },
    ...(can.kelolaIn(user) ? [{ label: 'Belum diteruskan', patch: { status: 'DITERIMA', antrian: '' }, on: f.status === 'DITERIMA' }] : []),
    { label: 'Menunggu disposisi', patch: { status: 'MENUNGGU_DISPOSISI', antrian: '' }, on: f.status === 'MENUNGGU_DISPOSISI' },
    { label: 'Sedang diproses', patch: { status: 'SEDANG_DIPROSES', antrian: '' }, on: f.status === 'SEDANG_DIPROSES' },
    { label: 'Terlambat', patch: { status: '', antrian: 'terlambat' }, on: f.antrian === 'terlambat' },
    { label: 'Selesai', patch: { status: 'SELESAI', antrian: '' }, on: f.status === 'SELESAI' },
  ];
  return (
    <div className="page">
      <PageHead title="Surat masuk" sub="Semua surat yang diterima beserta posisi dan tenggatnya.">
        {can.kelolaIn(user) && <Link to="/surat-masuk/baru" className="btn btn-primary">Catat Surat Masuk</Link>}
      </PageHead>
      <div className="stack">
        <div className="chips" role="group" aria-label="Saring cepat">
          {chips.map((c) => <button key={c.label} type="button" className="chip" aria-pressed={c.on} onClick={() => set(c.patch)}>{c.label}</button>)}
        </div>
        <div className="card card-pad">
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <Field label="Kata kunci">{(id) => <Input id={id} type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Nomor, perihal, pengirim" />}</Field>
            <Field label="Status">{(id) => <Select id={id} value={f.status} onChange={(e) => set({ status: e.target.value, antrian: '' })} placeholder="Semua status" options={Object.entries(STATUS_IN).map(([value, [label]]) => ({ value, label }))} />}</Field>
            <Field label="Sifat">{(id) => <Select id={id} value={f.sifat} onChange={(e) => set({ sifat: e.target.value })} placeholder="Semua sifat" options={SIFAT} />}</Field>
            <Field label="Diterima dari">{(id) => <Input id={id} type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} />}</Field>
            <Field label="Sampai">{(id) => <Input id={id} type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} />}</Field>
          </div>
        </div>
      </div>
      <div className="card">
        <Async q={q} isEmpty={(d) => d.items.length === 0} empty={<Empty title="Tidak ada surat yang cocok" text="Ubah kata kunci atau saringan, atau catat surat baru." />}>
          {(d) => (
            <div className="table-wrap">
              <table className="table stackable">
                <thead><tr><th>No. Agenda</th><th>Perihal</th><th>Pengirim</th><th>Posisi</th><th>Status</th><th>Tenggat</th></tr></thead>
                <tbody>
                  {d.items.map((l) => (
                    <tr key={l.id}>
                      <td className="primary"><Stamp>{l.no_agenda}</Stamp></td>
                      <td className="primary"><div className="cell-title"><Link to={`/surat-masuk/${l.id}`}>{l.perihal}</Link></div><div className="muted small">{l.no_surat}, {l.sifat}{l.prioritas === 'Mendesak' ? ', mendesak' : ''}</div></td>
                      <td data-label="Pengirim">{l.asal}<div className="muted small">Diterima {fmtDate(l.tgl_diterima)}</div></td>
                      <td data-label="Posisi">{l.pic || <span className="muted">{l.status === 'DITERIMA' ? 'Di Tata Usaha' : l.status === 'MENUNGGU_DISPOSISI' ? 'Di pimpinan' : '-'}</span>}</td>
                      <td data-label="Status"><StatusIn status={l.status} /></td>
                      <td data-label="Tenggat"><div>{fmtDate(l.deadline)}</div><Sla sla={l.sla} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </div>
      {q.data && <p className="muted small">Menampilkan {q.data.items.length} dari {q.data.total} surat.</p>}
    </div>
  );
}

export function LetterInNew() {
  const nav = useNavigate();
  const [f, setF] = useState({ no_surat: '', tgl_surat: todayIso(), tgl_diterima: todayIso(), asal: '', instansi: '', alamat: '', perihal: '', jenis: 'Surat Dinas', sifat: 'Biasa', prioritas: 'Normal', lampiran: '', catatan: '' });
  const [files, setFiles] = useState([]);
  const [errs, setErrs] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = useAction(() => upload('/letters-in', f, { files }), { success: (r) => `Surat tercatat dengan nomor agenda ${r.no_agenda}`, keys: ['letters-in', 'dashboard'], onDone: (r) => nav(`/surat-masuk/${r.id}`) });
  const submit = (e) => {
    e.preventDefault();
    const er = {};
    if (!f.no_surat.trim()) er.no_surat = 'Nomor surat wajib diisi';
    if (!f.asal.trim()) er.asal = 'Asal surat wajib diisi';
    if (!f.perihal.trim()) er.perihal = 'Perihal wajib diisi';
    if (f.tgl_diterima < f.tgl_surat) er.tgl_diterima = 'Tanggal diterima tidak boleh sebelum tanggal surat';
    setErrs(er);
    if (Object.keys(er).length === 0) save.mutate();
  };
  return (
    <div className="page">
      <PageHead title="Catat surat masuk" sub="Sistem memberi nomor agenda otomatis setelah disimpan." />
      <form className="card card-pad stack" style={{ gap: 20 }} onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field label="Nomor surat" error={errs.no_surat}>{(id, e) => <Input id={id} error={e} value={f.no_surat} onChange={set('no_surat')} />}</Field>
          <Field label="Jenis surat">{(id) => <Input id={id} value={f.jenis} onChange={set('jenis')} />}</Field>
          <Field label="Tanggal surat">{(id) => <Input id={id} type="date" value={f.tgl_surat} onChange={set('tgl_surat')} />}</Field>
          <Field label="Tanggal diterima" error={errs.tgl_diterima}>{(id, e) => <Input id={id} type="date" error={e} value={f.tgl_diterima} onChange={set('tgl_diterima')} />}</Field>
          <Field label="Asal surat (nama pengirim)" error={errs.asal}>{(id, e) => <Input id={id} error={e} value={f.asal} onChange={set('asal')} />}</Field>
          <Field label="Instansi">{(id) => <Input id={id} value={f.instansi} onChange={set('instansi')} />}</Field>
          <Field label="Alamat pengirim" span2>{(id) => <Input id={id} value={f.alamat} onChange={set('alamat')} />}</Field>
          <Field label="Perihal" span2 error={errs.perihal}>{(id, e) => <Textarea id={id} error={e} rows={2} value={f.perihal} onChange={set('perihal')} />}</Field>
          <Field label="Sifat surat">{(id) => <Select id={id} value={f.sifat} onChange={set('sifat')} options={SIFAT} />}</Field>
          <Field label="Prioritas" hint="Menentukan target SLA">{(id) => <Select id={id} value={f.prioritas} onChange={set('prioritas')} options={PRIORITAS} />}</Field>
          <Field label="Lampiran">{(id) => <Input id={id} value={f.lampiran} onChange={set('lampiran')} placeholder="Contoh: 1 berkas" />}</Field>
          <Field label="Catatan penerimaan">{(id) => <Input id={id} value={f.catatan} onChange={set('catatan')} />}</Field>
        </div>
        <div className="field">
          <span className="label">File surat (hasil pindai)</span>
          <FilePicker files={files} setFiles={setFiles} accept=".pdf,.png,.jpg,.jpeg,.docx" />
          <span className="hint">PDF, JPG, PNG, atau DOCX. Maksimal 15 MB per file.</span>
        </div>
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>{save.isPending ? 'Menyimpan...' : 'Simpan dan Beri Nomor Agenda'}</button>
          <Link to="/surat-masuk" className="btn">Batal</Link>
        </div>
      </form>
    </div>
  );
}
