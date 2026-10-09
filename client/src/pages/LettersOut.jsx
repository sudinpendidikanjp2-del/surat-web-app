import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, post } from '../api.js';
import { useUser } from '../auth.jsx';
import { Async, Empty, ErrorState, Field, Input, Loading, PageHead, Select, Sheet, Stamp, StatusOut, Textarea, useAction } from '../ui.jsx';
import { ListView } from '../table.jsx';
import { NoteSheet } from '../forms.jsx';
import { fmtDate, STATUS_OUT, todayIso } from '../format.js';

const OUT_FILTERS = [
  { key: 'status', label: 'Status', type: 'multi', options: Object.entries(STATUS_OUT).map(([value, [label]]) => ({ value, label })) },
  { key: 'from', label: 'Tanggal surat dari', type: 'date' },
  { key: 'to', label: 'Tanggal surat sampai', type: 'date' },
];
const OUT_EXTRA = ['antrian', 'mine'];
const OUT_DEFAULTS = { sort: 'dibuat', dir: 'desc' };

export function LettersOut() {
  const user = useUser();
  const canWrite = ['superadmin', 'tu', 'pejabat', 'pelaksana'].includes(user.role);
  const approver = ['superadmin', 'pimpinan'].includes(user.role);
  const tabs = [
    { label: 'Semua', patch: { status: '', antrian: '', mine: '' } },
    ...(canWrite ? [{ label: 'Buatan saya', patch: { status: '', antrian: '', mine: '1' } }] : []),
    ...(approver || user.role === 'pejabat' ? [{ label: 'Menunggu keputusan saya', patch: { status: '', antrian: 'menunggu_saya', mine: '' } }] : []),
    { label: 'Draf', patch: { status: 'DRAFT,REVISI', antrian: '', mine: '' } },
    { label: 'Menunggu tanda tangan atau kirim', patch: { status: 'NOMOR_DIBERIKAN,DITANDATANGANI', antrian: '', mine: '' } },
  ];
  const bulk = [
    ...(approver ? [
      { key: 'setuju', label: 'Setujui', tone: 'primary', url: '/letters-out/bulk/keputusan', body: { aksi: 'setuju' }, confirm: { title: (n) => `Setujui ${n} surat keluar?`, body: (n) => `${n} surat akan disetujui dan masing-masing diberi nomor surat otomatis. Surat yang tidak sedang menunggu persetujuan dilewati.`, button: 'Setujui dan Beri Nomor' } },
      { key: 'revisi', label: 'Kembalikan untuk Revisi', url: '/letters-out/bulk/keputusan', body: { aksi: 'revisi' }, sheet: (p) => <NoteSheet title={`Kembalikan ${p.count} surat untuk revisi`} label="Catatan perbaikan" required confirmLabel="Kembalikan" {...p} /> },
    ] : []),
    ...(canWrite ? [{ key: 'ajukan', label: 'Ajukan Persetujuan', url: '/letters-out/bulk/ajukan', confirm: { title: (n) => `Ajukan ${n} surat untuk persetujuan?`, body: () => 'Surat yang isiannya belum lengkap atau belum punya penandatangan dilewati dan dilaporkan.', button: 'Ajukan' } }] : []),
  ];
  const columns = [
    { key: 'surat', header: 'Surat', sort: 'perihal', primary: true, title: (r) => r.perihal,
      cell: (l) => (
        <>
          <Stamp>{l.no_agenda}</Stamp>
          <div className="cell-title" style={{ marginTop: 4 }}><Link to={`/surat-keluar/${l.id}`}>{l.perihal}</Link></div>
          <div className="muted small">{l.jenis}, dibuat {l.pembuat}{l.asal_agenda ? `, balasan ${l.asal_agenda}` : ''}</div>
        </>
      ) },
    { key: 'tujuan', header: 'Tujuan', sort: 'tujuan', cell: (l) => l.tujuan },
    { key: 'nomor', header: 'Nomor surat', sort: 'nomor', className: 'num', cell: (l) => l.nomor_surat || <span className="muted">Belum bernomor</span> },
    { key: 'status', header: 'Status', sort: 'status', cell: (l) => <StatusOut status={l.status} /> },
  ];
  return (
    <ListView
      title="Surat keluar" sub="Draf, persetujuan, penomoran, tanda tangan, dan pengiriman."
      actions={canWrite && <Link className="btn btn-primary" to="/surat-keluar/baru">Buat Surat</Link>}
      queryKey="letters-out" endpoint="/letters-out" idsEndpoint="/letters-out/ids" csv
      filters={OUT_FILTERS} extraKeys={OUT_EXTRA} tabs={tabs} columns={columns} rowTo={(l) => `/surat-keluar/${l.id}`} bulk={bulk}
      defaults={OUT_DEFAULTS} searchPlaceholder="Cari nomor, perihal, tujuan"
      empty={<Empty title="Belum ada surat keluar" text="Buat surat dari template, atau dari halaman surat masuk untuk surat balasan."/>}
    />
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
