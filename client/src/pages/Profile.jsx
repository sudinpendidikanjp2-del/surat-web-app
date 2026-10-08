import { useState } from 'react';
import { post } from '../api.js';
import { Sheet, Field, Input, useAction } from '../ui.jsx';

export function ChangePassword({ onClose }) {
  const [f, setF] = useState({ lama: '', baru: '', ulang: '' });
  const [err, setErr] = useState('');
  const act = useAction(() => post('/auth/password', { lama: f.lama, baru: f.baru }), { success: 'Kata sandi diperbarui' });
  const submit = (close) => {
    if (f.baru.length < 8) return setErr('Kata sandi baru minimal 8 karakter');
    if (f.baru !== f.ulang) return setErr('Pengulangan kata sandi tidak sama');
    setErr('');
    act.mutate(undefined, { onSuccess: () => close() });
    return undefined;
  };
  return (
    <Sheet title="Ubah kata sandi" onClose={onClose} footer={({ close }) => (
      <>
        <button type="button" className="btn" onClick={() => close()}>Batal</button>
        <button type="button" className="btn btn-primary" disabled={act.isPending} onClick={() => submit(close)}>Simpan kata sandi</button>
      </>
    )}>
      <div className="sheet-body">
        {err && <div className="alert alert-late" role="alert">{err}</div>}
        <Field label="Kata sandi lama">{(id) => <Input id={id} type="password" autoComplete="current-password" value={f.lama} onChange={(e) => setF({ ...f, lama: e.target.value })} />}</Field>
        <Field label="Kata sandi baru" hint="Minimal 8 karakter">{(id) => <Input id={id} type="password" autoComplete="new-password" value={f.baru} onChange={(e) => setF({ ...f, baru: e.target.value })} />}</Field>
        <Field label="Ulangi kata sandi baru">{(id) => <Input id={id} type="password" autoComplete="new-password" value={f.ulang} onChange={(e) => setF({ ...f, ulang: e.target.value })} />}</Field>
      </div>
    </Sheet>
  );
}
