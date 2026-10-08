import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, post, qs } from '../api.js';
import { useUser } from '../auth.jsx';
import { Async, Empty, ErrorState, Field, Input, Loading, PageHead, Select, Sheet, Stamp, StatusOut, Textarea, useAction } from '../ui.jsx';
import { fmtDate, STATUS_OUT, todayIso } from '../format.js';

export function LettersOut() {
  const user = useUser();
  const [sp, setSp] = useSearchParams();
  const f = { q: sp.get('q') || '', status: sp.get('status') || '', antrian: sp.get('antrian') || '', mine: sp.get('mine') || '' };
  const set = (patch) => { const n = { ...f, ...patch }; const p = {}; for (const [k, v] of Object.entries(n)) if (v) p[k] = v; setSp(p, { replace: true }); };
  const q = useQuery({ queryKey: ['letters-out', f], queryFn: () => get(`/letters-out${qs(f)}`) });
  const canWrite = ['superadmin', 'tu', 'pejabat', 'pelaksana'].includes(user.role);
  return (
    <div className="page">
      <PageHead title="Surat keluar" sub="Draf, persetujuan, penomoran, tanda tangan, dan pengiriman.">
        {canWrite && <Link className="btn btn-primary" to="/surat-keluar/baru">Buat Surat</Link>}
      </PageHead>
      <div className="chips" role="group" aria-label="Saring cepat">
        <button type="button" className="chip" aria-pressed={!f.status && !f.antrian && !f.mine} onClick={() => set({ status: '', antrian: '', mine: '' })}>Semua</button>
        {canWrite && <button type="button" className="chip" aria-pressed={f.mine === '1'} onClick={() => set({ mine: '1', status: '', antrian: '' })}>Buatan saya</button>}
        <button type="button" className="chip" aria-pressed={f.antrian === 'menunggu_saya'} onClick={() => set({ antrian: 'menunggu_saya', status: '', mine: '' })}>Menunggu keputusan saya</button>
        <button type="button" className="chip" aria-pressed={f.status === 'DRAFT'} onClick={() => set({ status: 'DRAFT', antrian: '', mine: '' })}>Draf</button>
      </div>
      <div className="card card-pad">
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <Field label="Kata kunci">{(id) => <Input id={id} type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Nomor, perihal, tujuan" />}</Field>
          <Field label="Status">{(id) => <Select id={id} value={f.status} onChange={(e) => set({ status: e.target.value, antrian: '' })} placeholder="Semua status" options={Object.entries(STATUS_OUT).map(([value, [label]]) => ({ value, label }))} />}</Field>
        </div>
      </div>
      <div className="card">
        <Async q={q} empty={<Empty title="Belum ada surat keluar" text="Buat surat dari template, atau dari halaman surat masuk untuk surat balasan." action={canWrite && <Link className="btn btn-primary btn-sm" to="/surat-keluar/baru">Buat Surat</Link>} />}>
          {(rows) => (
            <div className="table-wrap">
              <table className="table stackable">
                <thead><tr><th>No. Agenda</th><th>Perihal</th><th>Tujuan</th><th>Nomor surat</th><th>Status</th></tr></thead>
                <tbody>{rows.map((l) => (
                  <tr key={l.id}>
                    <td className="primary"><Stamp>{l.no_agenda}</Stamp></td>
                    <td className="primary"><div className="cell-title"><Link to={`/surat-keluar/${l.id}`}>{l.perihal}</Link></div><div className="muted small">{l.jenis}, dibuat {l.pembuat}{l.asal_agenda ? `, balasan ${l.asal_agenda}` : ''}</div></td>
                    <td data-label="Tujuan">{l.tujuan}</td>
                    <td data-label="Nomor surat" className="num">{l.nomor_surat || <span className="muted">Belum bernomor</span>}</td>
                    <td data-label="Status"><StatusOut status={l.status} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Async>
      </div>
    </div>
  );
}

/** Formulir surat dari definisi field template. Dipakai untuk membuat dan mengubah. */
export function LetterForm({ template, versionId, initial, signers, onSubmit, pending, submitLabel, onCancel }) {
  const [f, setF] = useState(initial);
  const [errs, setErrs] = useState({});
  const [preview, setPreview] = useState(null);
  const fields = template.fields.filter((x) => !x.sistem && !x.bawaan);
  const hasPerihal = template.fields.some((x) => x.name === 'perihal' || x.name === 'hal');
  const hasTujuan = template.fields.some((x) => x.name === 'nama_penerima' || x.name === 'kepada');
  const setField = (name) => (e) => setF({ ...f, fields: { ...f.fields, [name]: e.target.value } });
  const validate = () => {
    const er = {};
    if (!f.perihal.trim()) er.perihal = 'Wajib diisi';
    if (!f.tujuan.trim()) er.tujuan = 'Wajib diisi';
    if (!f.tgl_surat) er.tgl_surat = 'Wajib diisi';
    setErrs(er);
    return Object.keys(er).length === 0;
  };
  const prev = useAction(() => post('/letters-out/pratinjau', { template_version_id: versionId, ...f }), { onDone: (r) => setPreview(r.html) });
  return (
    <form className="card card-pad stack" style={{ gap: 20 }} noValidate onSubmit={(e) => { e.preventDefault(); if (validate()) onSubmit(f); }}>
      <div className="form-grid">
        <Field label={hasPerihal ? 'Perihal / Hal' : 'Perihal'} span2 error={errs.perihal}>{(id, e) => <Input id={id} error={e} value={f.perihal} onChange={(ev) => setF({ ...f, perihal: ev.target.value })} />}</Field>
        <Field label={hasTujuan ? 'Tujuan surat (Yth. / Kepada)' : 'Tujuan surat'} span2 error={errs.tujuan}>{(id, e) => <Input id={id} error={e} value={f.tujuan} onChange={(ev) => setF({ ...f, tujuan: ev.target.value })} />}</Field>
        <Field label="Nomor surat" hint="Diberikan otomatis setelah disetujui pimpinan. Mencegah nomor ganda.">{(id) => <Input id={id} value="Otomatis" disabled />}</Field>
        <Field label="Tanggal surat" error={errs.tgl_surat}>{(id, e) => <Input id={id} type="date" error={e} value={f.tgl_surat} onChange={(ev) => setF({ ...f, tgl_surat: ev.target.value })} />}</Field>
        <Field label="Penandatangan" span2>{(id) => <Select id={id} value={f.penandatangan_id || ''} onChange={(ev) => setF({ ...f, penandatangan_id: ev.target.value ? Number(ev.target.value) : null })} placeholder="Pilih penandatangan" options={signers.map((u) => ({ value: u.id, label: `${u.nama}${u.jabatan ? `, ${u.jabatan}` : ''}` }))} />}</Field>
        {fields.map((x) => (
          <Field key={x.name} label={x.label} span2={x.type === 'textarea'}>
            {(id) => (x.type === 'textarea'
              ? <Textarea id={id} rows={3} value={f.fields[x.name] || ''} onChange={setField(x.name)} />
              : <Input id={id} type={x.type === 'date' ? 'date' : 'text'} value={f.fields[x.name] || ''} onChange={setField(x.name)} />)}
          </Field>
        ))}
      </div>
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Menyimpan...' : submitLabel}</button>
        <button type="button" className="btn" disabled={prev.isPending} onClick={() => validate() && prev.mutate()}>{prev.isPending ? 'Menyusun...' : 'Pratinjau Surat'}</button>
        {onCancel}
      </div>
      {preview != null && (
        <Sheet title="Pratinjau surat" wide onClose={() => setPreview(null)}>
          <div className="sheet-body"><div className="preview-doc" dangerouslySetInnerHTML={{ __html: preview }} /><p className="muted small">Nomor surat diberikan setelah disetujui. Pratinjau ini belum disimpan.</p></div>
        </Sheet>
      )}
    </form>
  );
}

export function LetterOutNew() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const dari = sp.get('dari');
  const user = useUser();
  const templates = useQuery({ queryKey: ['templates'], queryFn: () => get('/templates') });
  const [tplId, setTplId] = useState(sp.get('template') || '');
  const detail = useQuery({ queryKey: ['template', tplId], queryFn: () => get(`/templates/${tplId}`), enabled: Boolean(tplId) });
  const src = useQuery({ queryKey: ['letter', dari], queryFn: () => get(`/letters-in/${dari}`), enabled: Boolean(dari) });
  const users = useQuery({ queryKey: ['user-options'], queryFn: () => get('/users/options') });
  const signers = useMemo(() => (users.data || []).filter((u) => ['pimpinan', 'pejabat', 'superadmin'].includes(u.role)), [users.data]);
  const create = useAction((body) => post('/letters-out', body), { success: (r) => `Draf ${r.no_agenda} tersimpan`, keys: ['letters-out', 'dashboard', 'letter', 'timeline'], onDone: (r) => nav(`/surat-keluar/${r.id}`) });

  const active = detail.data?.versions.find((v) => v.aktif);
  const l = src.data?.letter;
  const initial = useMemo(() => ({
    perihal: l ? `Tanggapan atas ${l.perihal}` : '',
    tujuan: l ? `${l.asal}${l.instansi ? `, ${l.instansi}` : ''}` : '',
    tgl_surat: todayIso(),
    penandatangan_id: signers.find((u) => u.role === 'pimpinan')?.id || null,
    fields: l ? { alamat_penerima: l.alamat || '', dasar_surat: `surat ${l.asal} nomor ${l.no_surat} tanggal ${fmtDate(l.tgl_surat)} perihal ${l.perihal}`, lampiran: '' } : {},
  }), [l, signers]);

  return (
    <div className="page">
      <PageHead title="Buat surat" sub={l ? `Surat balasan untuk ${l.no_agenda}. Perihal, tujuan, dan dasar surat sudah diisi dari surat masuk.` : 'Pilih jenis surat, isi formulir, lalu simpan sebagai draf.'} />
      <section className="section">
        <h2>Jenis surat</h2>
        <Async q={templates} empty={<Empty title="Belum ada template aktif" text={user.role === 'superadmin' ? 'Unggah template DOCX di halaman Template.' : 'Minta administrator mengunggah template DOCX.'} />}>
          {(rows) => (
            <div className="chips" role="radiogroup" aria-label="Jenis surat">
              {rows.map((t) => <button key={t.id} type="button" role="radio" aria-checked={String(t.id) === String(tplId)} className="chip" aria-pressed={String(t.id) === String(tplId)} onClick={() => setTplId(String(t.id))}>{t.nama}</button>)}
            </div>
          )}
        </Async>
      </section>
      {tplId && (
        <section className="section">
          <h2>Isi surat</h2>
          {detail.isLoading || src.isLoading || users.isLoading ? <Loading rows={4} /> : detail.isError ? <ErrorState error={detail.error} retry={() => detail.refetch()} /> : !active ? <Empty title="Template belum punya versi aktif" /> : (
            <LetterForm key={`${tplId}-${l?.id || 0}-${signers.length}`} template={active} versionId={active.id} initial={initial} signers={signers} pending={create.isPending} submitLabel="Simpan Draf"
              onSubmit={(f) => create.mutate({ ...f, template_version_id: active.id, letter_in_id: dari ? Number(dari) : null })}
              onCancel={<Link className="btn btn-quiet" to="/surat-keluar">Batal</Link>} />
          )}
        </section>
      )}
    </div>
  );
}
