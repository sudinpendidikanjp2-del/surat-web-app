import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, post, put, upload } from '../api.js';
import { useUser } from '../auth.jsx';
import { Async, Discussion, Field, FileList, FilePicker, Group, NextStep, Select, Sheet, SheetBody, SheetFoot as Footer, Stages, Stamp, StatusOut, Tabs, Textarea, useAction } from '../ui.jsx';
import { Menu } from '../table.jsx';
import { LetterForm } from './LettersOut.jsx';
import { fmtDate, fmtDateTime, METODE } from '../format.js';

const KEYS = ['letter-out', 'letters-out', 'dashboard', 'letter', 'timeline', 'letters-in'];
const FLOW = [['DRAFT', 'Draf'], ['REVIEW', 'Review'], ['MENUNGGU_PERSETUJUAN', 'Persetujuan'], ['NOMOR_DIBERIKAN', 'Bernomor'], ['DITANDATANGANI', 'Tanda tangan'], ['DIKIRIM', 'Dikirim'], ['SELESAI', 'Selesai']];
const AKSI = { AJUKAN: 'Diajukan untuk persetujuan', AJUKAN_REVIEW: 'Diajukan untuk review', REVIEW_LANJUT: 'Review: diteruskan ke pimpinan', REVIEW_REVISI: 'Review: dikembalikan untuk revisi', SETUJU: 'Disetujui dan diberi nomor', REVISI: 'Dikembalikan untuk revisi', TOLAK: 'Ditolak', TTD: 'Dokumen bertanda tangan diunggah', KIRIM: 'Pengiriman dicatat', SELESAI: 'Selesai' };
const ORDER = ['DRAFT', 'REVISI', 'REVIEW', 'MENUNGGU_PERSETUJUAN', 'DISETUJUI', 'NOMOR_DIBERIKAN', 'DITANDATANGANI', 'DIKIRIM', 'SELESAI'];

function DecisionSheet({ id, mode, onClose }) {
  const [aksi, setAksi] = useState('setuju');
  const [catatan, setCatatan] = useState('');
  const [err, setErr] = useState('');
  const isReview = mode === 'review';
  const act = useAction(() => (isReview ? post(`/letters-out/${id}/review`, { aksi: aksi === 'setuju' ? 'lanjut' : 'revisi', catatan }) : post(`/letters-out/${id}/keputusan`, { aksi, catatan })), { success: 'Keputusan tersimpan', keys: KEYS });
  const opts = isReview ? [['setuju', 'Lanjutkan ke persetujuan pimpinan'], ['revisi', 'Kembalikan untuk revisi']] : [['setuju', 'Setujui dan berikan nomor surat'], ['revisi', 'Kembalikan untuk diperbaiki'], ['tolak', 'Tolak surat']];
  return (
    <Sheet title={isReview ? 'Hasil review' : 'Keputusan persetujuan'} onClose={onClose} footer={({ close }) => <Footer close={close} pending={act.isPending} danger={aksi === 'tolak'} label={aksi === 'setuju' ? (isReview ? 'Lanjutkan' : 'Setujui') : aksi === 'tolak' ? 'Tolak Surat' : 'Kembalikan'} onSubmit={() => { if (aksi !== 'setuju' && !catatan.trim()) return setErr('Catatan wajib diisi'); act.mutate(undefined, { onSuccess: () => close() }); return undefined; }} />}>
      <SheetBody>
        {err && <div className="alert alert-late" role="alert">{err}</div>}
        <Group legend="Keputusan">
          {opts.map(([v, label]) => <label key={v} className="check-row"><input type="radio" name="keputusan" checked={aksi === v} onChange={() => setAksi(v)} /><span>{label}</span></label>)}
        </Group>
        <Field label="Catatan" hint={aksi === 'setuju' ? 'Opsional' : 'Wajib diisi agar pembuat tahu yang perlu diperbaiki'}>{(fid) => <Textarea id={fid} rows={3} value={catatan} onChange={(e) => setCatatan(e.target.value)} />}</Field>
      </SheetBody>
    </Sheet>
  );
}

function SignSheet({ id, onClose }) {
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState('');
  const act = useAction(() => upload(`/letters-out/${id}/ttd`, {}, { file: files[0] }), { success: 'Dokumen bertanda tangan diunggah', keys: KEYS });
  return (
    <Sheet title="Unggah dokumen bertanda tangan" onClose={onClose} footer={({ close }) => <Footer close={close} pending={act.isPending} label="Unggah dan Tandai Ditandatangani" onSubmit={() => { if (!files.length) return setErr('Pilih file PDF'); act.mutate(undefined, { onSuccess: () => close() }); return undefined; }} />}>
      <SheetBody>
        <p className="muted">Cetak surat bernomor, tandatangani, pindai, lalu unggah hasilnya sebagai PDF.</p>
        {err && <div className="alert alert-late" role="alert">{err}</div>}
        <FilePicker files={files} setFiles={setFiles} multiple={false} accept=".pdf" label="Pilih PDF bertanda tangan" />
      </SheetBody>
    </Sheet>
  );
}

function SendSheet({ id, onClose }) {
  const [metode, setMetode] = useState('Surat resmi');
  const [catatan, setCatatan] = useState('');
  const act = useAction(() => post(`/letters-out/${id}/kirim`, { metode, catatan }), { success: 'Pengiriman dicatat', keys: KEYS });
  return (
    <Sheet title="Catat pengiriman surat" onClose={onClose} footer={({ close }) => <Footer close={close} pending={act.isPending} label="Catat Pengiriman" onSubmit={() => act.mutate(undefined, { onSuccess: () => close() })} />}>
      <SheetBody>
        <Field label="Metode pengiriman">{(fid) => <Select id={fid} value={metode} onChange={(e) => setMetode(e.target.value)} options={METODE.filter((m) => m !== 'Telepon')} />}</Field>
        <Field label="Catatan">{(fid) => <Textarea id={fid} rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} />}</Field>
      </SheetBody>
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
        <SheetBody>
          <LetterForm template={{ fields: d.template.fields }} versionId={l.template_version_id} signers={signers} pending={act.isPending} submitLabel="Simpan Perubahan"
            initial={{ perihal: l.perihal, tujuan: l.tujuan, tgl_surat: l.tgl_surat, penandatangan_id: l.penandatangan_id, fields: l.fields }}
            onSubmit={(f) => act.mutate(f, { onSuccess: () => close() })} />
        </SheetBody>
      )}
    </Sheet>
  );
}

/** Langkah berikutnya untuk surat keluar: tepat satu tombol utama, sisanya di menu. */
function nextStep(d, run) {
  const l = d.letter; const c = d.can;
  const lastNote = d.approvals[d.approvals.length - 1]?.catatan;
  if (l.status === 'DITOLAK') return { key: null, quiet: true, title: 'Surat ditolak', desc: lastNote || 'Lihat catatan pada tab Persetujuan.' };
  if (c.putuskan) return { key: 'decide', title: 'Surat menunggu keputusan Anda', desc: 'Setujui untuk memberi nomor surat otomatis, atau kembalikan dengan catatan.', primary: { label: 'Putuskan Persetujuan', onClick: () => run.sheet('decide') } };
  if (c.review) return { key: 'review', title: 'Surat menunggu review Anda', desc: 'Teruskan ke pimpinan atau kembalikan untuk revisi.', primary: { label: 'Beri Hasil Review', onClick: () => run.sheet('review') } };
  if (c.ajukan && d.kurang.length > 0) return { key: c.edit ? 'edit' : null, title: 'Lengkapi isian sebelum diajukan', desc: `Belum diisi: ${d.kurang.join(', ')}.`, primary: c.edit ? { label: 'Ubah Surat', onClick: () => run.sheet('edit') } : undefined };
  if (c.ajukan) return { key: 'ajukan', title: l.status === 'REVISI' ? 'Revisi selesai? Ajukan kembali' : 'Draf siap diajukan', desc: l.status === 'REVISI' && lastNote ? `Catatan perbaikan: ${lastNote}` : 'Pimpinan akan diberi tahu dan nomor surat diberikan setelah disetujui.', primary: { label: 'Ajukan Persetujuan', onClick: run.submit } };
  if (c.ttd) return { key: 'sign', title: 'Surat sudah bernomor', desc: 'Cetak, tanda tangani, pindai, lalu unggah sebagai PDF.', primary: { label: 'Unggah Dokumen Bertanda Tangan', onClick: () => run.sheet('sign') } };
  if (c.kirim) return { key: 'send', title: 'Surat sudah ditandatangani', desc: 'Catat cara dan waktu pengiriman kepada tujuan.', primary: { label: 'Catat Pengiriman', onClick: () => run.sheet('send') } };
  if (c.selesai) return { key: 'selesai', title: 'Surat sudah dikirim', desc: 'Tandai selesai bila tidak ada tindak lanjut lagi.', primary: { label: 'Tandai Selesai', onClick: run.done } };
  const quiet = { REVIEW: 'Menunggu review', MENUNGGU_PERSETUJUAN: 'Menunggu persetujuan pimpinan', SELESAI: 'Surat keluar selesai', DIKIRIM: 'Surat sudah dikirim', DRAFT: 'Draf belum diajukan', REVISI: 'Menunggu revisi dari pembuat' };
  return { key: null, quiet: true, title: quiet[l.status] || 'Tidak ada tindakan untuk Anda saat ini', desc: 'Anda tetap dapat membuka dokumen dan riwayatnya.' };
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
          const step = nextStep(d, { sheet: setSheet, submit: () => submit.mutate(), done: () => done.mutate() });
          const busy = submit.isPending || done.isPending || reviewReq.isPending;
          // Tindakan yang sudah menjadi tombol utama tidak diulang di menu.
          const more = [
            c.edit && step.key !== 'edit' && { label: 'Ubah Surat', onClick: () => setSheet('edit') },
            c.ajukanReview && { label: 'Ajukan Review', disabled: busy, onClick: () => reviewReq.mutate() },
            c.ajukan && d.kurang.length === 0 && step.key !== 'ajukan' && { label: 'Ajukan Persetujuan', disabled: busy, onClick: () => submit.mutate() },
            c.review && step.key !== 'review' && { label: 'Beri Hasil Review', onClick: () => setSheet('review') },
            c.ttd && step.key !== 'sign' && { label: 'Unggah Dokumen Bertanda Tangan', onClick: () => setSheet('sign') },
            c.kirim && step.key !== 'send' && { label: 'Catat Pengiriman', onClick: () => setSheet('send') },
            c.selesai && step.key !== 'selesai' && { label: 'Tandai Selesai', disabled: busy, onClick: () => done.mutate() },
            { sep: true },
            { label: 'Unduh DOCX', onClick: () => { window.location.href = `/api/letters-out/${l.id}/unduh?format=docx`; } },
            { label: 'Unduh PDF', onClick: () => { window.location.href = `/api/letters-out/${l.id}/unduh?format=pdf`; } },
          ];
          return (
            <>
              <div className="case-head">
                <div className="row"><Stamp>{l.no_agenda}</Stamp><StatusOut status={l.status} />{l.nomor_surat && <strong className="num">{l.nomor_surat}</strong>}</div>
                <h1>{l.perihal}</h1>
                <div className="case-meta"><span>{l.jenis}, template v{d.template.versi}</span><span>Kepada {l.tujuan}</span><span>Tanggal {fmtDate(l.tgl_surat)}</span><span>Dibuat oleh {l.pembuat}</span>{d.signer && <span>Penandatangan {d.signer.nama}</span>}</div>
                {d.asal && <p>Balasan untuk <Link to={`/surat-masuk/${d.asal.id}`}>{d.asal.no_agenda}</Link>, {d.asal.perihal}</p>}
              </div>

              {l.status !== 'DITOLAK' && <Stages label="Tahap surat keluar" items={FLOW.map(([k, label]) => ({ key: k, label, done: idx >= ORDER.indexOf(k) || (k === 'REVIEW' && idx >= 2) }))} />}

              <NextStep step={step} busy={busy}><Menu label="Aksi lain" items={more} /></NextStep>

              <Tabs label="Bagian surat keluar" value={tab} onChange={setTab} tabs={[{ key: 'dokumen', label: 'Dokumen' }, { key: 'persetujuan', label: 'Persetujuan', count: d.approvals.length }, { key: 'berkas', label: 'Berkas', count: d.attachments.length }, { key: 'riwayat', label: 'Riwayat dan diskusi' }]} />
              {tab === 'dokumen' && (
                <div className="stack" role="tabpanel" id="panel-dokumen" aria-labelledby="tab-dokumen">
                  <div className="actions">
                    <a className="btn btn-sm" href={`/api/letters-out/${l.id}/unduh?format=docx`}>Unduh DOCX</a>
                    <a className="btn btn-sm" href={`/api/letters-out/${l.id}/unduh?format=pdf`}>Unduh PDF</a>
                  </div>
                  <Async q={view} isEmpty={() => false} rows={6}>{(v) => <div className="preview-doc" dangerouslySetInnerHTML={{ __html: v.html }} />}</Async>
                </div>
              )}
              {tab === 'persetujuan' && (
                <section className="card card-pad" role="tabpanel" id="panel-persetujuan" aria-labelledby="tab-persetujuan">
                  {d.approvals.length === 0 ? <p className="muted">Belum ada keputusan.</p> : <ol className="thread">{[...d.approvals].reverse().map((a) => <li key={a.id}><div className="when">{fmtDateTime(a.created_at)} · {a.user_nama}</div><div><strong>{AKSI[a.aksi] || a.aksi.replaceAll('_', ' ').toLowerCase()}</strong></div>{a.catatan && <div className="comment-text">{a.catatan}</div>}</li>)}</ol>}
                </section>
              )}
              {tab === 'berkas' && (
                <section className="card card-pad stack" role="tabpanel" id="panel-berkas" aria-labelledby="tab-berkas">
                  <FileList files={d.attachments} />
                  {c.unggah && user.role !== 'viewer' && <UploadMore id={l.id} />}
                </section>
              )}
              {tab === 'riwayat' && <section className="card card-pad" role="tabpanel" id="panel-riwayat" aria-labelledby="tab-riwayat"><Discussion queryKey={['timeline', 'out', id]} base={`/letters-out/${id}`} canWrite={user.role !== 'viewer'} label="Riwayat surat keluar" fieldLabel="Komentar" /></section>}

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
