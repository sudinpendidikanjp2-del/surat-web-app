import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, post, put, upload } from '../api.js';
import { useUser } from '../auth.jsx';
import { Async, Empty, Field, FileList, FilePicker, Select, Sheet, Stamp, StatusOut, Tabs, Textarea, useAction } from '../ui.jsx';
import { LetterForm } from './LettersOut.jsx';
import { fmtDate, fmtDateTime, METODE } from '../format.js';

const KEYS = ['letter-out', 'letters-out', 'dashboard', 'letter', 'timeline', 'letters-in'];
const FLOW = [['DRAFT', 'Draf'], ['REVIEW', 'Review'], ['MENUNGGU_PERSETUJUAN', 'Persetujuan'], ['NOMOR_DIBERIKAN', 'Bernomor'], ['DITANDATANGANI', 'Tanda tangan'], ['DIKIRIM', 'Dikirim'], ['SELESAI', 'Selesai']];
const ORDER = ['DRAFT', 'REVISI', 'REVIEW', 'MENUNGGU_PERSETUJUAN', 'DISETUJUI', 'NOMOR_DIBERIKAN', 'DITANDATANGANI', 'DIKIRIM', 'SELESAI'];

function Footer({ close, pending, label, onSubmit, danger }) {
  return (<><button type="button" className="btn" onClick={() => close()}>Batal</button><button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={pending} onClick={onSubmit}>{pending ? 'Memproses...' : label}</button></>);
}

function DecisionSheet({ id, mode, onClose }) {
  const [aksi, setAksi] = useState('setuju');
  const [catatan, setCatatan] = useState('');
  const [err, setErr] = useState('');
  const isReview = mode === 'review';
  const act = useAction(() => (isReview ? post(`/letters-out/${id}/review`, { aksi: aksi === 'setuju' ? 'lanjut' : 'revisi', catatan }) : post(`/letters-out/${id}/keputusan`, { aksi, catatan })), { success: 'Keputusan tersimpan', keys: KEYS });
  const opts = isReview ? [['setuju', 'Lanjutkan ke persetujuan pimpinan'], ['revisi', 'Kembalikan untuk revisi']] : [['setuju', 'Setujui dan berikan nomor surat'], ['revisi', 'Kembalikan untuk diperbaiki'], ['tolak', 'Tolak surat']];
  return (
    <Sheet title={isReview ? 'Hasil review' : 'Keputusan persetujuan'} onClose={onClose} footer={({ close }) => <Footer close={close} pending={act.isPending} danger={aksi === 'tolak'} label={aksi === 'setuju' ? (isReview ? 'Lanjutkan' : 'Setujui') : aksi === 'tolak' ? 'Tolak Surat' : 'Kembalikan'} onSubmit={() => { if (aksi !== 'setuju' && !catatan.trim()) return setErr('Catatan wajib diisi'); act.mutate(undefined, { onSuccess: () => close() }); return undefined; }} />}>
      <div className="sheet-body">
        {err && <div className="alert alert-late" role="alert">{err}</div>}
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">Keputusan</legend>
          {opts.map(([v, label]) => <label key={v} className="check-row"><input type="radio" name="keputusan" checked={aksi === v} onChange={() => setAksi(v)} /><span>{label}</span></label>)}
        </fieldset>
        <Field label="Catatan" hint={aksi === 'setuju' ? 'Opsional' : 'Wajib diisi agar pembuat tahu yang perlu diperbaiki'}>{(fid) => <Textarea id={fid} rows={3} value={catatan} onChange={(e) => setCatatan(e.target.value)} />}</Field>
      </div>
    </Sheet>
  );
}

function SignSheet({ id, onClose }) {
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState('');
  const act = useAction(() => upload(`/letters-out/${id}/ttd`, {}, { file: files[0] }), { success: 'Dokumen bertanda tangan diunggah', keys: KEYS });
  return (
    <Sheet title="Unggah dokumen bertanda tangan" onClose={onClose} footer={({ close }) => <Footer close={close} pending={act.isPending} label="Unggah dan Tandai Ditandatangani" onSubmit={() => { if (!files.length) return setErr('Pilih file PDF'); act.mutate(undefined, { onSuccess: () => close() }); return undefined; }} />}>
      <div className="sheet-body">
        <p className="muted">Cetak surat bernomor, tandatangani, pindai, lalu unggah hasilnya sebagai PDF.</p>
        {err && <div className="alert alert-late" role="alert">{err}</div>}
        <FilePicker files={files} setFiles={setFiles} multiple={false} accept=".pdf" label="Pilih PDF bertanda tangan" />
      </div>
    </Sheet>
  );
}

function SendSheet({ id, onClose }) {
  const [metode, setMetode] = useState('Surat resmi');
  const [catatan, setCatatan] = useState('');
  const act = useAction(() => post(`/letters-out/${id}/kirim`, { metode, catatan }), { success: 'Pengiriman dicatat', keys: KEYS });
  return (
    <Sheet title="Catat pengiriman surat" onClose={onClose} footer={({ close }) => <Footer close={close} pending={act.isPending} label="Catat Pengiriman" onSubmit={() => act.mutate(undefined, { onSuccess: () => close() })} />}>
      <div className="sheet-body">
        <Field label="Metode pengiriman">{(fid) => <Select id={fid} value={metode} onChange={(e) => setMetode(e.target.value)} options={METODE.filter((m) => m !== 'Telepon')} />}</Field>
        <Field label="Catatan">{(fid) => <Textarea id={fid} rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} />}</Field>
      </div>
    </Sheet>
  );
}

function EditSheet({ d, onClose }) {
  const users = useQuery({ queryKey: ['user-options'], queryFn: () => get('/users/options') });
  const l = d.letter;
  const act = useAction((body) => put(`/letters-out/${l.id}`, body), { success: 'Surat diperbarui', keys: KEYS });
  const signers = (users.data || []).filter((u) => ['pimpinan', 'pejabat', 'superadmin'].includes(u.role));
  return (
    <Sheet title="Ubah surat" wide onClose={onClose}>
      {({ close }) => (
        <div className="sheet-body">
          <LetterForm template={{ fields: d.template.fields }} versionId={l.template_version_id} signers={signers} pending={act.isPending} submitLabel="Simpan Perubahan"
            initial={{ perihal: l.perihal, tujuan: l.tujuan, tgl_surat: l.tgl_surat, penandatangan_id: l.penandatangan_id, fields: l.fields }}
            onSubmit={(f) => act.mutate(f, { onSuccess: () => close() })} />
        </div>
      )}
    </Sheet>
  );
}

function Thread({ id }) {
  const user = useUser();
  const q = useQuery({ queryKey: ['timeline', 'out', id], queryFn: () => get(`/letters-out/${id}/timeline`) });
  const [teks, setTeks] = useState('');
  const act = useAction(() => post(`/letters-out/${id}/komentar`, { teks }), { keys: ['timeline'], onDone: () => setTeks('') });
  return (
    <div className="stack" style={{ gap: 20 }}>
      {user.role !== 'viewer' && (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); if (teks.trim()) act.mutate(); }}>
          <Field label="Komentar" hint="Gunakan @namapengguna untuk menyebut rekan.">{(fid) => <Textarea id={fid} rows={2} value={teks} onChange={(e) => setTeks(e.target.value)} />}</Field>
          <div><button type="submit" className="btn btn-primary btn-sm" disabled={act.isPending || !teks.trim()}>Kirim Komentar</button></div>
        </form>
      )}
      <Async q={q} empty={<Empty title="Belum ada riwayat" />}>
        {(rows) => (
          <ol className="thread" aria-label="Riwayat surat keluar">
            {[...rows].reverse().map((e) => <li key={e.id} className={`t-${e.tipe}`}><div className="when">{fmtDateTime(e.created_at)}{e.user_nama ? ` · ${e.user_nama}` : ''}</div>{e.tipe === 'komentar' ? <div className="comment-text">{e.teks}</div> : <div>{e.teks}</div>}</li>)}
          </ol>
        )}
      </Async>
    </div>
  );
}

export default function LetterOutDetail() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['letter-out', id], queryFn: () => get(`/letters-out/${id}`) });
  const view = useQuery({ queryKey: ['letter-out-preview', id, q.data?.letter?.updated_at], queryFn: () => get(`/letters-out/${id}/pratinjau`), enabled: Boolean(q.data) });
  const [tab, setTab] = useState('dokumen');
  const [sheet, setSheet] = useState(null);
  const close = () => setSheet(null);
  const reviewReq = useAction(() => post(`/letters-out/${id}/ajukan-review`, {}), { success: 'Diajukan untuk review', keys: KEYS });
  const submit = useAction(() => post(`/letters-out/${id}/ajukan`, {}), { success: 'Diajukan untuk persetujuan', keys: KEYS });
  const done = useAction(() => post(`/letters-out/${id}/selesai`, {}), { success: 'Surat keluar selesai', keys: KEYS });
  const user = useUser();

  return (
    <div className="page">
      <Async q={q} isEmpty={() => false} rows={6}>
        {(d) => {
          const l = d.letter; const c = d.can;
          const idx = ORDER.indexOf(l.status);
          return (
            <>
              <div className="case-head">
                <div className="row"><Stamp>{l.no_agenda}</Stamp><StatusOut status={l.status} />{l.nomor_surat && <strong className="num">{l.nomor_surat}</strong>}</div>
                <h1>{l.perihal}</h1>
                <div className="case-meta"><span>{l.jenis}, template v{d.template.versi}</span><span>Kepada {l.tujuan}</span><span>Tanggal {fmtDate(l.tgl_surat)}</span><span>Dibuat oleh {l.pembuat}</span>{d.signer && <span>Penandatangan {d.signer.nama}</span>}</div>
                {d.asal && <p>Balasan untuk <Link to={`/surat-masuk/${d.asal.id}`}>{d.asal.no_agenda}</Link>, {d.asal.perihal}</p>}
              </div>

              {l.status === 'DITOLAK' ? <div className="alert alert-late">Surat ditolak. Lihat catatan pada tab Persetujuan.</div> : (
                <ol className="stages" aria-label="Tahap surat keluar" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
                  {FLOW.map(([k, label]) => { const on = idx >= ORDER.indexOf(k) || (k === 'REVIEW' && idx >= 2); return <li key={k} className={on ? 'done' : ''}><span className="stage-mark" aria-hidden="true" /><span>{label}<span className="sr-only">{on ? ', tercapai' : ', belum'}</span></span></li>; })}
                </ol>
              )}
              {l.status === 'REVISI' && d.approvals.length > 0 && <div className="alert alert-warn"><strong>Perlu revisi.</strong> {d.approvals[d.approvals.length - 1].catatan}</div>}
              {c.ajukan && d.kurang.length > 0 && <div className="alert alert-warn">Lengkapi sebelum diajukan: {d.kurang.join(', ')}.</div>}

              <div className="quick" role="group" aria-label="Tindakan surat">
                {c.edit && <button type="button" className="btn" onClick={() => setSheet('edit')}>Ubah Surat</button>}
                <a className="btn" href={`/api/letters-out/${l.id}/unduh?format=docx`}>Unduh DOCX</a>
                <a className="btn" href={`/api/letters-out/${l.id}/unduh?format=pdf`}>Unduh PDF</a>
                {c.ajukanReview && <button type="button" className="btn" disabled={reviewReq.isPending} onClick={() => reviewReq.mutate()}>Ajukan Review</button>}
                {c.ajukan && <button type="button" className="btn btn-primary" disabled={submit.isPending} onClick={() => submit.mutate()}>Ajukan Persetujuan</button>}
                {c.review && <button type="button" className="btn btn-primary" onClick={() => setSheet('review')}>Beri Hasil Review</button>}
                {c.putuskan && <button type="button" className="btn btn-primary" onClick={() => setSheet('decide')}>Putuskan Persetujuan</button>}
                {c.ttd && <button type="button" className="btn btn-primary" onClick={() => setSheet('sign')}>Unggah Dokumen Bertanda Tangan</button>}
                {c.kirim && <button type="button" className="btn btn-primary" onClick={() => setSheet('send')}>Catat Pengiriman</button>}
                {c.selesai && <button type="button" className="btn btn-primary" disabled={done.isPending} onClick={() => done.mutate()}>Tandai Selesai</button>}
              </div>

              <Tabs label="Bagian surat keluar" value={tab} onChange={setTab} tabs={[{ key: 'dokumen', label: 'Dokumen' }, { key: 'persetujuan', label: 'Persetujuan', count: d.approvals.length }, { key: 'berkas', label: 'Berkas', count: d.attachments.length }, { key: 'riwayat', label: 'Riwayat dan diskusi' }]} />
              {tab === 'dokumen' && <div role="tabpanel" id="panel-dokumen" aria-labelledby="tab-dokumen"><Async q={view} isEmpty={() => false} rows={6}>{(v) => <div className="preview-doc" dangerouslySetInnerHTML={{ __html: v.html }} />}</Async></div>}
              {tab === 'persetujuan' && (
                <section className="card card-pad" role="tabpanel" id="panel-persetujuan" aria-labelledby="tab-persetujuan">
                  {d.approvals.length === 0 ? <p className="muted">Belum ada keputusan.</p> : <ol className="thread">{[...d.approvals].reverse().map((a) => <li key={a.id}><div className="when">{fmtDateTime(a.created_at)} · {a.user_nama}</div><div><strong>{a.aksi.replaceAll('_', ' ').toLowerCase()}</strong></div>{a.catatan && <div className="comment-text">{a.catatan}</div>}</li>)}</ol>}
                </section>
              )}
              {tab === 'berkas' && (
                <section className="card card-pad stack" role="tabpanel" id="panel-berkas" aria-labelledby="tab-berkas">
                  <FileList files={d.attachments} />
                  {c.unggah && user.role !== 'viewer' && <UploadMore id={l.id} />}
                </section>
              )}
              {tab === 'riwayat' && <section className="card card-pad" role="tabpanel" id="panel-riwayat" aria-labelledby="tab-riwayat"><Thread id={id} /></section>}

              {sheet === 'edit' && <EditSheet d={d} onClose={close} />}
              {sheet === 'review' && <DecisionSheet id={l.id} mode="review" onClose={close} />}
              {sheet === 'decide' && <DecisionSheet id={l.id} mode="decide" onClose={close} />}
              {sheet === 'sign' && <SignSheet id={l.id} onClose={close} />}
              {sheet === 'send' && <SendSheet id={l.id} onClose={close} />}
            </>
          );
        }}
      </Async>
    </div>
  );
}

function UploadMore({ id }) {
  const [files, setFiles] = useState([]);
  const act = useAction(() => upload(`/letters-out/${id}/lampiran`, {}, { files }), { success: 'Berkas diunggah', keys: KEYS, onDone: () => setFiles([]) });
  return (
    <div className="stack">
      <span className="label">Tambah berkas pendukung</span>
      <FilePicker files={files} setFiles={setFiles} />
      <div><button type="button" className="btn btn-sm" disabled={!files.length || act.isPending} onClick={() => act.mutate()}>Unggah Berkas</button></div>
    </div>
  );
}
