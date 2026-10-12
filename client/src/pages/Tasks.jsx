import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, put, upload } from '../api.js';
import { useUser } from '../auth.jsx';
import { Async, Empty, Field, FileList, FilePicker, Group, Input, Progress, Select, Sheet, SheetBody, SheetFoot, Sla, Stamp, StatusTask, Textarea, useAction } from '../ui.jsx';
import { ListView } from '../table.jsx';
import { DateSheet, NoteSheet } from '../forms.jsx';
import { fmtDate, fmtDateTime, PRIORITAS, STATUS_TASK } from '../format.js';

const TASK_FILTERS = [
  { key: 'status', label: 'Status', type: 'multi', options: Object.entries(STATUS_TASK).map(([value, [label]]) => ({ value, label })) },
  { key: 'prioritas', label: 'Prioritas', type: 'multi', options: PRIORITAS },
  { key: 'from', label: 'Tenggat dari', type: 'date' },
  { key: 'to', label: 'Tenggat sampai', type: 'date' },
];
const TASK_EXTRA = ['scope', 'antrian'];
const TASK_DEFAULTS = { scope: 'saya', sort: 'tenggat', dir: 'asc' };

export function Tasks() {
  const user = useUser();
  const gives = ['superadmin', 'pimpinan', 'pejabat'].includes(user.role);
  const tabs = [
    { label: 'Terbuka', patch: { scope: 'saya', antrian: 'terbuka', status: '' } },
    { label: 'Hari ini', patch: { scope: 'saya', antrian: 'hari_ini', status: '' } },
    { label: 'Terlambat', patch: { scope: 'saya', antrian: 'terlambat', status: '' } },
    { label: 'Semua tugas saya', patch: { scope: 'saya', antrian: '', status: '' } },
    ...(gives ? [{ label: 'Yang saya berikan', patch: { scope: 'diberikan', antrian: '', status: '' } }] : []),
    ...(user.role !== 'pelaksana' ? [{ label: 'Semua', patch: { scope: 'semua', antrian: '', status: '' } }] : []),
  ];
  const bulk = [
    { key: 'proses', label: 'Tandai Sedang Diproses', url: '/tasks/bulk/status', body: { status: 'DIPROSES' } },
    { key: 'selesai', label: 'Tandai Selesai', tone: 'primary', url: '/tasks/bulk/status', body: { status: 'SELESAI' }, confirm: { title: (n) => `Tandai ${n} tugas selesai?`, body: () => 'Progres menjadi 100%. Tugas yang sudah ditutup atau bukan tanggung jawab Anda dilewati.', button: 'Tandai Selesai' } },
    ...(gives ? [
      { key: 'tenggat', label: 'Ubah Tenggat', url: '/tasks/bulk/tenggat', sheet: (p) => <DateSheet title={`Ubah tenggat ${p.count} tugas`} label="Tenggat baru" confirmLabel="Ubah Tenggat" {...p} /> },
      { key: 'batal', label: 'Batalkan', tone: 'danger', url: '/tasks/bulk/status', body: { status: 'DIBATALKAN' }, sheet: (p) => <NoteSheet title={`Batalkan ${p.count} tugas`} label="Alasan pembatalan" required danger confirmLabel="Batalkan Tugas" {...p} /> },
    ] : []),
  ];
  const columns = [
    { key: 'tugas', header: 'Tugas', sort: 'judul', primary: true, title: (r) => r.judul,
      cell: (t) => (<><div className="cell-title"><Link to={`/tugas/${t.id}`}>{t.judul}</Link></div><div className="muted small"><Stamp>{t.no_agenda}</Stamp> {t.perihal}</div></>) },
    { key: 'pic', header: 'Penanggung jawab', cell: (t) => <>{t.pic_nama}<div className="muted small">dari {t.assigner_nama}</div></> },
    { key: 'status', header: 'Status', sort: 'status', cell: (t) => <StatusTask status={t.status} /> },
    { key: 'progres', header: 'Progres', sort: 'progres', className: 'num', cell: (t) => `${t.progress}%` },
    { key: 'tenggat', header: 'Tenggat', sort: 'tenggat', cell: (t) => <>{fmtDate(t.deadline)}<br /><Sla sla={t.sla} /></> },
  ];
  return (
    <ListView
      title="Tugas saya" sub="Pekerjaan tindak lanjut yang menjadi tanggung jawab Anda."
      queryKey="tasks" endpoint="/tasks" idsEndpoint="/tasks/ids" csv
      filters={TASK_FILTERS} extraKeys={TASK_EXTRA} tabs={tabs} columns={columns} rowTo={(t) => `/tugas/${t.id}`}
      bulk={user.role === 'viewer' ? [] : bulk} defaults={TASK_DEFAULTS} searchPlaceholder="Cari tugas atau surat"
      labelOf={(id) => `Tugas #${id}`}
      empty={<Empty title="Tidak ada tugas" text="Tugas muncul setelah pejabat membagi pekerjaan dari sebuah disposisi." />}
    />
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
    <Sheet title="Perbarui progres" onClose={onClose} footer={({ close }) => <SheetFoot close={close} pending={act.isPending} label="Simpan Pembaruan" onSubmit={() => submit(close)} />}>
      <SheetBody>
        {err && <div className="alert alert-late" role="alert">{err}</div>}
        <Field label="Status">{(id) => <Select id={id} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, progress: e.target.value === 'SELESAI' ? 100 : f.progress })} options={opts} />}</Field>
        <Field label={`Progres: ${f.progress}%`}>{(id) => <input id={id} type="range" min="0" max="100" step="5" value={f.progress} onChange={(e) => setF({ ...f, progress: Number(e.target.value) })} className="range" />}</Field>
        <Field label="Catatan" hint={f.status === 'MENUNGGU_DATA' ? 'Tulis data apa yang dibutuhkan. Pemberi tugas akan diberi tahu.' : undefined}>{(id) => <Textarea id={id} rows={3} value={f.catatan} onChange={(e) => setF({ ...f, catatan: e.target.value })} placeholder="Contoh: Koordinasi dengan sekolah sudah dilakukan, menunggu dokumen pendukung." />}</Field>
        <div className="field"><span className="label">Lampiran hasil (opsional)</span><FilePicker files={files} setFiles={setFiles} accept=".pdf,.docx,.xlsx,.xls,.doc,.png,.jpg,.jpeg,.csv,.txt" /></div>
      </SheetBody>
    </Sheet>
  );
}

function EditSheet({ data, onClose }) {
  const { task } = data;
  const users = useQuery({ queryKey: ['user-options'], queryFn: () => get('/users/options') });
  const [f, setF] = useState({ judul: task.judul, deskripsi: task.deskripsi || '', deadline: task.deadline?.slice(0, 10) || '', prioritas: task.prioritas, pic_user_id: task.pic_user_id });
  const act = useAction(() => put(`/tasks/${task.id}`, { ...f, pic_user_id: Number(f.pic_user_id) }), { success: 'Tugas diperbarui', keys: ['task', 'tasks', 'letter', 'timeline'] });
  return (
    <Sheet title="Ubah tugas" onClose={onClose} footer={({ close }) => <SheetFoot close={close} pending={act.isPending} label="Simpan Perubahan" onSubmit={() => act.mutate(undefined, { onSuccess: () => close() })} />}>
      <SheetBody>
        <Field label="Judul">{(id) => <Input id={id} value={f.judul} onChange={(e) => setF({ ...f, judul: e.target.value })} />}</Field>
        <Field label="Deskripsi">{(id) => <Textarea id={id} rows={3} value={f.deskripsi} onChange={(e) => setF({ ...f, deskripsi: e.target.value })} />}</Field>
        <div className="form-grid">
          <Field label="Penanggung jawab">{(id) => <Select id={id} value={f.pic_user_id} onChange={(e) => setF({ ...f, pic_user_id: e.target.value })} options={(users.data || []).filter((u) => u.role !== 'viewer').map((u) => ({ value: u.id, label: u.nama }))} />}</Field>
          <Field label="Prioritas">{(id) => <Select id={id} value={f.prioritas} onChange={(e) => setF({ ...f, prioritas: e.target.value })} options={PRIORITAS} />}</Field>
          <Field label="Batas waktu">{(id) => <Input id={id} type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} />}</Field>
        </div>
      </SheetBody>
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
                <div className="stack stack-lg">
                  <section className="card card-pad stack">
                    <div className="row between"><h2>Progres</h2><span className="num strong">{t.progress}%</span></div>
                    <Progress value={t.progress} label="Progres tugas" />
                    {t.deskripsi && <p>{t.deskripsi}</p>}
                    {t.checklist.length > 0 && (
                      <Group legend="Daftar periksa">
                        {(local ?? t.checklist).map((c, i) => (
                          <label key={i} className="check-row"><input type="checkbox" checked={c.selesai} disabled={!d.can.update} onChange={() => flip(local ?? t.checklist, i)} /><span>{c.teks}</span></label>
                        ))}
                      </Group>
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
