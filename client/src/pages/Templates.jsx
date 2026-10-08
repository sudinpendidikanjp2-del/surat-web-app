import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, post, put, upload } from '../api.js';
import { useUser } from '../auth.jsx';
import { Async, Empty, Field, FilePicker, Input, PageHead, Select, Sheet, Tag, Textarea, useAction } from '../ui.jsx';
import { fmtDate } from '../format.js';

function NewTemplateSheet({ onClose }) {
  const [f, setF] = useState({ nama: '', jenis: '', kode: '', kode_klasifikasi: '', deskripsi: '' });
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState('');
  const act = useAction(() => upload('/templates', f, { file: files[0] }), { success: 'Template dibuat', keys: ['templates'] });
  const s = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Sheet title="Unggah template baru" onClose={onClose} wide footer={({ close }) => (<><button type="button" className="btn" onClick={() => close()}>Batal</button><button type="button" className="btn btn-primary" disabled={act.isPending} onClick={() => { if (!f.nama.trim() || !f.jenis.trim() || !f.kode.trim()) return setErr('Nama, jenis, dan kode wajib diisi'); if (!files.length) return setErr('Pilih file DOCX'); setErr(''); act.mutate(undefined, { onSuccess: () => close() }); return undefined; }}>Unggah Template</button></>)}>
      <div className="sheet-body">
        <p className="muted">Tulis field di dalam dokumen Word dengan format <code>{'{{nama_field}}'}</code>, misalnya <code>{'{{nama_kegiatan}}'}</code>. Sistem membaca field otomatis.</p>
        {err && <div className="alert alert-late" role="alert">{err}</div>}
        <div className="form-grid">
          <Field label="Nama template">{(id) => <Input id={id} value={f.nama} onChange={s('nama')} placeholder="Surat Undangan Rapat" />}</Field>
          <Field label="Jenis surat">{(id) => <Input id={id} value={f.jenis} onChange={s('jenis')} placeholder="Surat Undangan" />}</Field>
          <Field label="Kode template" hint="Huruf kecil, angka, strip">{(id) => <Input id={id} value={f.kode} onChange={s('kode')} placeholder="undangan-rapat" />}</Field>
          <Field label="Kode klasifikasi nomor" hint="Bagian {kode} pada nomor surat">{(id) => <Input id={id} value={f.kode_klasifikasi} onChange={s('kode_klasifikasi')} placeholder="005" />}</Field>
          <Field label="Deskripsi" span2>{(id) => <Textarea id={id} rows={2} value={f.deskripsi} onChange={s('deskripsi')} />}</Field>
        </div>
        <FilePicker files={files} setFiles={setFiles} multiple={false} accept=".docx" label="Pilih file template DOCX" />
      </div>
    </Sheet>
  );
}

export function Templates() {
  const user = useUser();
  const q = useQuery({ queryKey: ['templates'], queryFn: () => get('/templates') });
  const [sheet, setSheet] = useState(false);
  const admin = user.role === 'superadmin';
  return (
    <div className="page">
      <PageHead title="Template surat" sub="Template DOCX dengan field dinamis. Versi lama tetap tersimpan untuk arsip.">
        {admin && <button type="button" className="btn btn-primary" onClick={() => setSheet(true)}>Unggah Template</button>}
      </PageHead>
      <div className="card">
        <Async q={q} empty={<Empty title="Belum ada template" text={admin ? 'Unggah file DOCX berisi placeholder.' : 'Administrator belum mengunggah template.'} />}>
          {(rows) => (
            <div className="table-wrap">
              <table className="table stackable">
                <thead><tr><th>Template</th><th>Jenis</th><th>Versi aktif</th><th>Jumlah versi</th><th>Status</th><th><span className="sr-only">Tindakan</span></th></tr></thead>
                <tbody>{rows.map((t) => (
                  <tr key={t.id}>
                    <td className="primary"><span className="cell-title"><Link to={`/template/${t.id}`}>{t.nama}</Link></span><div className="muted small">{t.deskripsi}</div></td>
                    <td data-label="Jenis">{t.jenis}</td>
                    <td data-label="Versi aktif">{t.versi_aktif ? `v${t.versi_aktif}` : '-'}</td>
                    <td data-label="Jumlah versi" className="num">{t.jumlah_versi}</td>
                    <td data-label="Status">{t.aktif ? <Tag tone="ok">Aktif</Tag> : <Tag tone="neutral">Nonaktif</Tag>}</td>
                    <td><Link className="btn btn-sm" to={`/surat-keluar/baru?template=${t.id}`}>Pakai Template</Link></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Async>
      </div>
      {sheet && <NewTemplateSheet onClose={() => setSheet(false)} />}
    </div>
  );
}

function VersionSheet({ id, onClose }) {
  const [files, setFiles] = useState([]);
  const [catatan, setCatatan] = useState('');
  const [aktif, setAktif] = useState(true);
  const [err, setErr] = useState('');
  const act = useAction(() => upload(`/templates/${id}/versi`, { catatan, aktifkan: aktif }, { file: files[0] }), { success: 'Versi baru ditambahkan', keys: ['template', 'templates'] });
  return (
    <Sheet title="Unggah versi baru" onClose={onClose} footer={({ close }) => (<><button type="button" className="btn" onClick={() => close()}>Batal</button><button type="button" className="btn btn-primary" disabled={act.isPending} onClick={() => { if (!files.length) return setErr('Pilih file DOCX'); act.mutate(undefined, { onSuccess: () => close() }); return undefined; }}>Unggah Versi</button></>)}>
      <div className="sheet-body">
        {err && <div className="alert alert-late" role="alert">{err}</div>}
        <FilePicker files={files} setFiles={setFiles} multiple={false} accept=".docx" label="Pilih file DOCX versi baru" />
        <Field label="Catatan versi">{(fid) => <Input id={fid} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Apa yang berubah" />}</Field>
        <label className="check-row"><input type="checkbox" checked={aktif} onChange={(e) => setAktif(e.target.checked)} /><span>Jadikan versi aktif. Surat yang sudah dibuat tetap memakai versi sebelumnya.</span></label>
      </div>
    </Sheet>
  );
}

function FieldsSheet({ id, version, onClose }) {
  const [fields, setFields] = useState(version.fields);
  const act = useAction(() => put(`/templates/${id}/versi/${version.id}/field`, { fields }), { success: 'Definisi field disimpan', keys: ['template'] });
  const set = (name, patch) => setFields(fields.map((f) => (f.name === name ? { ...f, ...patch } : f)));
  return (
    <Sheet title={`Field versi ${version.versi}`} wide onClose={onClose} footer={({ close }) => (<><button type="button" className="btn" onClick={() => close()}>Batal</button><button type="button" className="btn btn-primary" disabled={act.isPending} onClick={() => act.mutate(undefined, { onSuccess: () => close() })}>Simpan</button></>)}>
      <div className="sheet-body">
        <p className="muted">Field sistem (nomor, tanggal, kop, penandatangan) dan kolom bawaan formulir tidak dapat diubah.</p>
        {fields.map((f) => (f.sistem || f.bawaan ? (
          <div key={f.name} className="row"><code>{`{{${f.name}}}`}</code><Tag tone="neutral">{f.sistem ? 'Diisi sistem' : 'Kolom bawaan'}</Tag></div>
        ) : (
          <div key={f.name} className="form-grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 140px auto', alignItems: 'end' }}>
            <Field label={`Label untuk ${f.name}`}>{(id2) => <Input id={id2} value={f.label} onChange={(e) => set(f.name, { label: e.target.value })} />}</Field>
            <Field label="Tipe">{(id2) => <Select id={id2} value={f.type} onChange={(e) => set(f.name, { type: e.target.value })} options={[{ value: 'text', label: 'Teks' }, { value: 'textarea', label: 'Teks panjang' }, { value: 'date', label: 'Tanggal' }]} />}</Field>
            <label className="check-row"><input type="checkbox" checked={f.required} onChange={(e) => set(f.name, { required: e.target.checked })} /><span>Wajib</span></label>
          </div>
        )))}
      </div>
    </Sheet>
  );
}

function PreviewSheet({ id, vid, onClose }) {
  const q = useQuery({ queryKey: ['tpl-preview', id, vid], queryFn: () => get(`/templates/${id}/versi/${vid}/pratinjau`) });
  return (
    <Sheet title="Pratinjau template" wide onClose={onClose}>
      <div className="sheet-body"><Async q={q} isEmpty={() => false}>{(d) => <div className="preview-doc" dangerouslySetInnerHTML={{ __html: d.html }} />}</Async></div>
    </Sheet>
  );
}

export function TemplateDetail() {
  const { id } = useParams();
  const user = useUser();
  const admin = user.role === 'superadmin';
  const q = useQuery({ queryKey: ['template', id], queryFn: () => get(`/templates/${id}`) });
  const [sheet, setSheet] = useState(null);
  const activate = useAction((vid) => post(`/templates/${id}/versi/${vid}/aktifkan`), { success: 'Versi diaktifkan', keys: ['template', 'templates'] });
  const toggle = useAction((t) => put(`/templates/${id}`, { ...t, aktif: !t.aktif }), { success: 'Status template diubah', keys: ['template', 'templates'] });
  return (
    <div className="page">
      <Async q={q} isEmpty={() => false} rows={4}>
        {({ template: t, versions }) => (
          <>
            <PageHead title={t.nama} sub={`${t.jenis}${t.kode_klasifikasi ? `, kode klasifikasi ${t.kode_klasifikasi}` : ''}. ${t.deskripsi || ''}`}>
              <Link className="btn btn-primary" to={`/surat-keluar/baru?template=${t.id}`}>Pakai Template</Link>
              {admin && <button type="button" className="btn" onClick={() => setSheet({ k: 'ver' })}>Unggah Versi Baru</button>}
              {admin && <button type="button" className="btn btn-quiet" onClick={() => toggle.mutate(t)}>{t.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>}
            </PageHead>
            <div className="card">
              <div className="table-wrap">
                <table className="table stackable">
                  <thead><tr><th>Versi</th><th>Field</th><th>Dibuat</th><th>Status</th><th><span className="sr-only">Tindakan</span></th></tr></thead>
                  <tbody>{versions.map((v) => (
                    <tr key={v.id}>
                      <td className="primary"><span className="cell-title">v{v.versi}</span><div className="muted small">{v.catatan}</div></td>
                      <td data-label="Field" className="small">{v.fields.filter((f) => !f.sistem && !f.bawaan).map((f) => f.label).join(', ') || '-'}</td>
                      <td data-label="Dibuat">{fmtDate(v.created_at)}<div className="muted small">{v.dibuat_oleh}</div></td>
                      <td data-label="Status">{v.aktif ? <Tag tone="ok">Aktif</Tag> : <Tag tone="neutral">Arsip</Tag>}</td>
                      <td><div className="actions">
                        <button type="button" className="btn btn-sm" onClick={() => setSheet({ k: 'prev', v })}>Pratinjau</button>
                        {admin && <button type="button" className="btn btn-sm" onClick={() => setSheet({ k: 'fields', v })}>Atur Field</button>}
                        {admin && <a className="btn btn-sm" href={`/api/templates/${t.id}/versi/${v.id}/unduh`}>Unduh</a>}
                        {admin && !v.aktif && <button type="button" className="btn btn-sm" disabled={activate.isPending} onClick={() => activate.mutate(v.id)}>Aktifkan</button>}
                      </div></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
            {sheet?.k === 'ver' && <VersionSheet id={t.id} onClose={() => setSheet(null)} />}
            {sheet?.k === 'fields' && <FieldsSheet id={t.id} version={sheet.v} onClose={() => setSheet(null)} />}
            {sheet?.k === 'prev' && <PreviewSheet id={t.id} vid={sheet.v.id} onClose={() => setSheet(null)} />}
          </>
        )}
      </Async>
    </div>
  );
}
