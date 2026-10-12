import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { post } from '../api.js';
import { Field, Input, Stamp } from '../ui.jsx';

export default function Login() {
  const qc = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) { setError('Isi nama pengguna dan kata sandi'); return; }
    setBusy(true);
    try {
      const r = await post('/auth/login', { username: username.trim(), password });
      qc.setQueryData(['me'], r.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <section className="login-side" aria-label="Tentang aplikasi">
        <Stamp>SM-TAHUN-NOMOR</Stamp>
        <div className="stack stack-md">
          <h1>Surat berada di mana, dipegang siapa, apa langkah berikutnya.</h1>
          <p>Satu catatan untuk setiap urusan: dari surat diterima, disposisi, tugas, surat balasan, sampai arsip.</p>
        </div>
        <p className="small">Gunakan akun yang diberikan administrator.</p>
      </section>
      <main className="login-main">
        <form className="login-card" onSubmit={submit} noValidate>
          <div>
            <h2>Masuk</h2>
            <p className="muted gap-top">Gunakan nama pengguna dan kata sandi Anda.</p>
          </div>
          {error && <div className="alert alert-late" role="alert">{error}</div>}
          <Field label="Nama pengguna">{(id) => <Input id={id} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" autoFocus />}</Field>
          <Field label="Kata sandi">{(id) => <Input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />}</Field>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Memeriksa…' : 'Masuk ke Sistem Surat'}</button>
          <p className="small muted center">Pengirim surat? <Link to="/lacak">Cek progres surat dengan kode pelacakan</Link></p>
        </form>
      </main>
    </div>
  );
}
