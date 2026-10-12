import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from './api.js';
import { useUser } from './auth.jsx';
import { ErrorState, Field, Group, Input, Loading, Select, Sheet, SheetBody, SheetFoot as Foot, Textarea } from './ui.jsx';
import { plusDays, TINDAKAN, todayIso } from './format.js';

export const initialDispose = () => ({ to_user_ids: [], to_unit_ids: [], tindakan: ['Untuk ditindaklanjuti'], instruksi: '', deadline: plusDays(3), prioritas: 'Normal' });

export function validateDispose(f) {
  if (f.to_user_ids.length + f.to_unit_ids.length === 0) return 'Pilih minimal satu penerima';
  if (f.tindakan.length === 0) return 'Pilih minimal satu tindakan';
  if (!f.instruksi.trim()) return 'Instruksi wajib diisi';
  return '';
}

/** Isian disposisi, dipakai untuk satu surat maupun banyak surat sekaligus. */
export function DisposeFields({ f, setF, onlyStaff = false }) {
  const user = useUser();
  const users = useQuery({ queryKey: ['user-options'], queryFn: () => get('/users/options') });
  const units = useQuery({ queryKey: ['units'], queryFn: () => get('/units') });
  const toggle = (k, v) => setF((s) => ({ ...s, [k]: s[k].includes(v) ? s[k].filter((x) => x !== v) : [...s[k], v] }));
  const people = (users.data || []).filter((u) => u.id !== user.id && u.role !== 'viewer' && (!onlyStaff || ['pejabat', 'pelaksana'].includes(u.role)));
  return (
    <>
      <Group legend="Diteruskan kepada unit">
        {units.isLoading ? <Loading rows={1} /> : (units.data || []).filter((u) => u.aktif && u.kode !== 'PIM').map((u) => (
          <label key={u.id} className="check-row"><input type="checkbox" checked={f.to_unit_ids.includes(u.id)} onChange={() => toggle('to_unit_ids', u.id)} /><span>{u.nama}</span></label>
        ))}
      </Group>
      <Group legend="Atau kepada pejabat atau pegawai">
        {users.isLoading ? <Loading rows={2} /> : users.isError ? <ErrorState error={users.error} /> : people.map((u) => (
          <label key={u.id} className="check-row"><input type="checkbox" checked={f.to_user_ids.includes(u.id)} onChange={() => toggle('to_user_ids', u.id)} /><span>{u.nama} <span className="muted small">{u.jabatan || ''}{u.unit_nama ? `, ${u.unit_nama}` : ''}</span></span></label>
        ))}
      </Group>
      <Group legend="Tindakan">
        {TINDAKAN.map((t) => <label key={t} className="check-row"><input type="checkbox" checked={f.tindakan.includes(t)} onChange={() => toggle('tindakan', t)} /><span>{t}</span></label>)}
      </Group>
      <Field label="Instruksi">{(id) => <Textarea id={id} value={f.instruksi} onChange={(e) => setF({ ...f, instruksi: e.target.value })} placeholder="Contoh: Mohon ditindaklanjuti dan dikoordinasikan dengan pihak terkait." />}</Field>
      <div className="form-grid">
        <Field label="Batas waktu">{(id) => <Input id={id} type="date" min={todayIso()} value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} />}</Field>
        <Field label="Prioritas">{(id) => <Select id={id} value={f.prioritas} onChange={(e) => setF({ ...f, prioritas: e.target.value })} options={['Normal', 'Tinggi', 'Mendesak']} />}</Field>
      </div>
    </>
  );
}

/** Lembar disposisi massal: satu isian berlaku untuk semua surat terpilih. */
export function BulkDisposeSheet({ count, onClose, run, pending }) {
  const [f, setF] = useState(initialDispose());
  const [err, setErr] = useState('');
  return (
    <Sheet title={`Berikan disposisi ke ${count} surat`} onClose={onClose} wide footer={({ close }) => (
      <Foot close={close} pending={pending} label={`Kirim Disposisi ke ${count} Surat`} onSubmit={() => { const e = validateDispose(f); setErr(e); if (!e) run(f); }} />
    )}>
      <SheetBody>
        <p className="muted">Isian ini berlaku sama untuk semua surat terpilih. Surat yang sudah selesai atau tidak dapat Anda disposisikan akan dilewati dan dilaporkan.</p>
        {err && <div className="alert alert-late" role="alert">{err}</div>}
        <DisposeFields f={f} setF={setF} />
      </SheetBody>
    </Sheet>
  );
}

/** Lembar satu isian teks, untuk alasan atau catatan pada aksi massal. */
export function NoteSheet({ title, label, hint, required, confirmLabel, danger, onClose, run, pending, field = 'catatan' }) {
  const [v, setV] = useState('');
  const [err, setErr] = useState('');
  return (
    <Sheet title={title} onClose={onClose} footer={({ close }) => (
      <Foot close={close} pending={pending} danger={danger} label={confirmLabel} onSubmit={() => { if (required && !v.trim()) return setErr(`${label} wajib diisi`); setErr(''); run({ [field]: v }); return undefined; }} />
    )}>
      <SheetBody>
        {err && <div className="alert alert-late" role="alert">{err}</div>}
        <Field label={label} hint={hint}>{(id) => <Textarea id={id} rows={3} value={v} onChange={(e) => setV(e.target.value)} />}</Field>
      </SheetBody>
    </Sheet>
  );
}

export function DateSheet({ title, label, confirmLabel, onClose, run, pending }) {
  const [v, setV] = useState(plusDays(3));
  return (
    <Sheet title={title} onClose={onClose} footer={({ close }) => <Foot close={close} pending={pending} label={confirmLabel} onSubmit={() => run({ deadline: v })} />}>
      <SheetBody><Field label={label}>{(id) => <Input id={id} type="date" value={v} onChange={(e) => setV(e.target.value)} />}</Field></SheetBody>
    </Sheet>
  );
}
