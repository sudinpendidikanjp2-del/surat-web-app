import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, post, put, qs, upload } from '../api.js';
import { useUser } from '../auth.jsx';
import { Async, Empty, Field, FileList, FilePicker, Input, PageHead, Progress, Select, Sheet, Sla, Stamp, StatusTask, Textarea, useAction } from '../ui.jsx';
import { fmtDate, fmtDateTime, PRIORITAS, STATUS_TASK } from '../format.js';

export function Tasks() {
  const user = useUser();
  const [scope, setScope] = useState('saya');
  const [status, setStatus] = useState('');
  const q = useQuery({ queryKey: ['tasks', scope, status], queryFn: () => get(`/tasks${qs({ scope, status })}`) });
  const gives = ['superadmin', 'pimpinan', 'pejabat'].includes(user.role);
  return (
    <div className="page">
      <PageHead title="Tugas saya" sub="Pekerjaan tindak lanjut yang menjadi tanggung jawab Anda." />
      <div className="row">
        <div className="chips" role="group" aria-label="Cakupan tugas">
          <button type="button" className="chip" aria-pressed={scope === 'saya'} onClick={() => setScope('saya')}>Tugas saya</button>
          {gives && <button type="button" className="chip" aria-pressed={scope === 'diberikan'} onClick={() => setScope('diberikan')}>Yang saya berikan</button>}
          {user.role !== 'pelaksana' && <button type="button" className="chip" aria-pressed={scope === 'semua'} onClick={() => setScope('semua')}>Semua</button>}
        </div>
        <div style={{ minWidth: 200 }}><label className="sr-only" htmlFor="f-status">Saring status</label><Select id="f-status" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Semua status" options={Object.entries(STATUS_TASK).map(([value, [label]]) => ({ value, label }))} /></div>
      </div>
      <div className="card">
        <Async q={q} empty={<Empty title="Tidak ada tugas" text="Tugas muncul setelah pejabat membagi pekerjaan dari sebuah disposisi." />}>
          {(rows) => (
            <div className="table-wrap">
              <table className="table stackable">
                <thead><tr><th>Tugas</th><th>Surat</th><th>PIC</th><th>Status</th><th>Progres</th><th>Tenggat</th></tr></thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id}>
                      <td className="primary"><span className="cell-title"><Link to={`/tugas/${t.id}`}>{t.judul}</Link></span></td>
                      <td data-label="Surat"><Stamp>{t.no_agenda}</Stamp></td>
                      <td data-label="PIC">{t.pic_nama}</td>
                      <td data-label="Status"><StatusTask status={t.status} /></td>
                      <td data-label="Progres" className="num">{t.progress}%</td>
                      <td data-label="Tenggat">{fmtDate(t.deadline)}<br /><Sla sla={t.sla} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </div>
    </div>
  );
}

function UpdateSheet({ data, onClose }) {
  const { task, can } = data;
  const [f, setF] = useState({ status: task.status === 'BELUM_DIMULAI' || task.status === 'DITERIMA' ? 'DIPROSES' : task.status, progress: task.progress, catatan: '' });
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState('');
  const act = useAction(() => upload(`/tasks/${task.id}/update`, f, { files }), { success: 'Progres diperbarui', keys: ['task', 'tasks', 'dashboard', 'letter', 'timeline'] });
  const opts = Object.entries(STATUS_TASK).filter(([k]) => (can.batal ? true : k !== 'DIBATALKAN')).map(([value, [label]]) => ({ value, label }));
  const submit = (close) => {
    if (f.status === 'MENUNGGU_DATA' && !f.catatan.trim()) return setErr('Jelaskan data yang diminta pada catatan');
    if (f.status === 'DIBATALKAN' && !f.catatan.trim()) return setErr('Berikan alasan pembatalan pada catatan');
    setErr('');
    act.mutate(undefined, { onSuccess: () => close() });
    return undefined;
  };
  return (
    <Sheet title="Perbarui progres" onClose={onClose} footer={({ close }) => (<><button type="button" className="btn" onClick={() => close()}>Batal</button><button type="button" className="btn btn-primary" disabled={act.isPending} onClick={() => submit(close)}>Simpan Pembaruan</button></>)}>
      <div className="sheet-body">
        {err && <div className="alert alert-late" role="alert">{err}</div>}
        <Field label="Status">{(id) => <Select id={id} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, progress: e.target.value === 'SELESAI' ? 100 : f.progress })} options={opts} />}</Field>
        <Field label={`Progres: ${f.progress}%`}>{(id) => <input id={id} type="range" min="0" max="100" step="5" value={f.progress} onChange={(e) => setF({ ...f, progress: Number(e.target.value) })} style={{ width: '100%', accentColor: 'var(--accent)' }} />}</Field>
        <Field label="Catatan" hint={f.status === 'MENUNGGU_DATA' ? 'Tulis data apa yang dibutuhkan. Pemberi tugas akan diberi tahu.' : undefined}>{(id) => <Textarea id={id} rows={3} value={f.catatan} onChange={(e) => setF({ ...f, catatan: e.target.value })} placeholder="Contoh: Koordinasi dengan sekolah sudah dilakukan, menunggu dokumen pendukung." />}</Field>
        <div className="field"><span className="label">Lampiran hasil (opsional)</span><FilePicker files={files} setFiles={setFiles} accept=".pdf,.docx,.xlsx,.xls,.doc,.png,.jpg,.jpeg,.csv,.txt" /></div>
      </div>
    </Sheet>
  );
}

function EditSheet({ data, onClose }) {
  const { task } = data;
  const users = useQuery({ queryKey: ['user-options'], queryFn: () => get('/users/options') });
  const [f, setF] = useState({ judul: task.judul, deskripsi: task.deskripsi || '', deadline: task.deadline?.slice(0, 10) || '', prioritas: task.prioritas, pic_user_id: task.pic_user_id });
  const act = useAction(() => put(`/tasks/${task.id}`, { ...f, pic_user_id: Number(f.pic_user_id) }), { success: 'Tugas diperbarui', keys: ['task', 'tasks', 'letter', 'timeline'] });
  return (
    <Sheet title="Ubah tugas" onClose={onClose} footer={({ close }) => (<><button type="button" className="btn" onClick={() => close()}>Batal</button><button type="button" className="btn btn-primary" disabled={act.isPending} onClick={() => act.mutate(undefined, { onSuccess: () => close() })}>Simpan</button></>)}>
      <div className="sheet-body">
        <Field label="Judul">{(id) => <Input id={id} value={f.judul} onChange={(e) => setF({ ...f, judul: e.target.value })} />}</Field>
        <Field label="Deskripsi">{(id) => <Textarea id={id} rows={3} value={f.deskripsi} onChange={(e) => setF({ ...f, deskripsi: e.target.value })} />}</Field>
        <div className="form-grid">
          <Field label="Penanggung jawab">{(id) => <Select id={id} value={f.pic_user_id} onChange={(e) => setF({ ...f, pic_user_id: e.target.value })} options={(users.data || []).filter((u) => u.role !== 'viewer').map((u) => ({ value: u.id, label: u.nama }))} />}</Field>
          <Field label="Prioritas">{(id) => <Select id={id} value={f.prioritas} onChange={(e) => setF({ ...f, prioritas: e.target.value })} options={PRIORITAS} />}</Field>
          <Field label="Batas waktu">{(id) => <Input id={id} type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} />}</Field>
        </div>
      </div>
    </Sheet>
  );
}

export function TaskDetail() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['task', id], queryFn: () => get(`/tasks/${id}`) });
  const [sheet, setSheet] = useState(null);
  const [local, setLocal] = useState(null);
  const toggle = useAction((list) => upload(`/tasks/${id}/update`, { checklist: list }), { keys: ['task', 'tasks', 'dashboard'], onDone: () => setLocal(null) });
  const flip = (list, i) => {
    const next = list.map((x, j) => (j === i ? { ...x, selesai: !x.selesai } : x));
    setLocal(next);
    toggle.mutate(next, { onError: () => setLocal(null) });
  };
  return (
    <div className="page">
      <Async q={q} isEmpty={() => false} rows={5}>
        {(d) => {
          const t = d.task;
          return (
            <>
              <div className="case-head">
                <div className="row"><Stamp>{t.no_agenda}</Stamp><StatusTask status={t.status} /><Sla sla={t.sla} /></div>
                <h1>{t.judul}</h1>
                <div className="case-meta"><span>PIC {t.pic_nama}</span><span>Diberikan oleh {t.assigner_nama}</span><span>Tenggat {fmtDate(t.deadline)}</span><span>Prioritas {t.prioritas}</span></div>
                <p><Link to={`/surat-masuk/${t.letter_in_id}`}>{t.perihal}</Link></p>
              </div>
              <div className="quick">
                {d.can.update && <button type="button" className="btn btn-primary" onClick={() => setSheet('update')}>Perbarui Progres</button>}
                {d.can.edit && <button type="button" className="btn" onClick={() => setSheet('edit')}>Ubah Tugas</button>}
                <Link className="btn btn-quiet" to={`/surat-masuk/${t.letter_in_id}`}>Buka Surat</Link>
              </div>
              <div className="split">
                <div className="stack" style={{ gap: 20 }}>
                  <section className="card card-pad stack">
                    <div className="row" style={{ justifyContent: 'space-between' }}><h2>Progres</h2><span className="num" style={{ fontWeight: 650 }}>{t.progress}%</span></div>
                    <Progress value={t.progress} label="Progres tugas" />
                    {t.deskripsi && <p>{t.deskripsi}</p>}
                    {t.checklist.length > 0 && (
                      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                        <legend className="label">Daftar periksa</legend>
                        {(local ?? t.checklist).map((c, i) => (
                          <label key={i} className="check-row"><input type="checkbox" checked={c.selesai} disabled={!d.can.update} onChange={() => flip(local ?? t.checklist, i)} /><span>{c.teks}</span></label>
                        ))}
                      </fieldset>
                    )}
                  </section>
                  <section className="card card-pad stack">
                    <h2>Riwayat pembaruan</h2>
                    {d.updates.length === 0 ? <p className="muted">Belum ada pembaruan.</p> : (
                      <ol className="thread">
                        {d.updates.map((u) => (
                          <li key={u.id}><div className="when">{fmtDateTime(u.created_at)} · {u.user_nama}</div><div>{STATUS_TASK[u.status]?.[0]}, progres {u.progress}%</div>{u.catatan && <div className="comment-text">{u.catatan}</div>}</li>
                        ))}
                      </ol>
                    )}
                  </section>
                </div>
                <section className="card card-pad stack"><h2>Hasil dan lampiran</h2><FileList files={d.attachments} empty="Belum ada lampiran hasil" /></section>
              </div>
              {sheet === 'update' && <UpdateSheet data={d} onClose={() => setSheet(null)} />}
              {sheet === 'edit' && <EditSheet data={d} onClose={() => setSheet(null)} />}
            </>
          );
        }}
      </Async>
    </div>
  );
}
