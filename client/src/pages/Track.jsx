import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get } from '../api.js';
import { Field, Icon, Input, Loading } from '../ui.jsx';
import { fmtDate } from '../format.js';

/** Sama dengan server: terima kode berformat, tanpa tanda hubung, atau tautan penuh. */
export function normalizeCode(input) {
  let s = String(input || '').trim();
  const m = s.match(/\/lacak\/([^/?#\s]+)/i);
  if (m) s = m[1];
  s = s.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return /^[0-9A-HJKMNP-TV-Z]{20}$/.test(s) ? s : null;
}

function Header() {
  return (
    <div className="row" style={{ gap: 10 }}>
      <span className="brand-mark" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"><path d="M5 7h14M5 12h14M5 17h9" /></svg></span>
      <strong>Pelacakan Surat</strong>
    </div>
  );
}

function Form({ initial = '', error }) {
  const nav = useNavigate();
  const [v, setV] = useState(initial);
  const [err, setErr] = useState(error || '');
  const submit = (e) => {
    e.preventDefault();
    const c = normalizeCode(v);
    if (!c) { setErr('Kode tidak valid. Kode terdiri dari 20 huruf dan angka, misalnya 7K2M-9QXA-4TBD-H3WN-5RFP. Anda juga dapat menempelkan tautan lengkapnya.'); return; }
    setErr('');
    nav(`/lacak/${c}`);
  };
  return (
    <form className="card card-pad stack" style={{ gap: 14 }} onSubmit={submit} noValidate>
      <Field label="Kode pelacakan atau tautan" hint="Kode diberikan oleh petugas yang menerima surat Anda." error={err}>{(id, e) => <Input id={id} error={e} value={v} onChange={(ev) => setV(ev.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck="false" autoFocus />}</Field>
      <div><button type="submit" className="btn btn-primary">Cek Status Surat</button></div>
    </form>
  );
}

export default function Track() {
  const { code } = useParams();
  const norm = code ? normalizeCode(code) : null;
  useEffect(() => {
    const m = document.createElement('meta');
    m.name = 'robots'; m.content = 'noindex, nofollow';
    document.head.appendChild(m);
    const r = document.createElement('meta');
    r.name = 'referrer'; r.content = 'no-referrer';
    document.head.appendChild(r);
    const prev = document.title;
    document.title = 'Pelacakan Surat';
    return () => { m.remove(); r.remove(); document.title = prev; };
  }, []);
  const q = useQuery({ queryKey: ['lacak', norm], queryFn: () => get(`/public/lacak/${norm}`), enabled: Boolean(norm), retry: false, staleTime: 30000 });

  return (
    <main className="public">
      <div className="public-card">
        <Header />
        {!code && (
          <>
            <div><h1>Cek progres surat Anda</h1><p className="muted" style={{ marginTop: 8 }}>Masukkan kode pelacakan untuk melihat tahapan surat tanpa perlu masuk.</p></div>
            <Form />
          </>
        )}
        {code && !norm && <><div className="alert alert-late" role="alert">Kode atau tautan tidak valid.</div><Form initial={code} /></>}
        {norm && q.isLoading && <Loading rows={4} />}
        {norm && q.isError && (
          <>
            <div className="alert alert-late" role="alert">{q.error.status === 429 ? q.error.message : 'Kode tidak ditemukan atau sudah tidak berlaku. Periksa kembali kode Anda atau hubungi petugas.'}</div>
            <Form />
          </>
        )}
        {norm && q.data && (
          <>
            <div>
              <p className="muted small">Surat nomor</p>
              <h1 style={{ overflowWrap: 'anywhere' }}>{q.data.no_surat}</h1>
              <p className="muted" style={{ marginTop: 6 }}>Diterima {fmtDate(q.data.tgl_diterima)}. Diperbarui {fmtDate(q.data.diperbarui)}.</p>
            </div>
            <section className="card card-pad stack" aria-label="Status surat">
              <div className={`alert ${q.data.selesai ? 'alert-ok' : 'alert-warn'}`} role="status"><strong>{q.data.selesai ? 'Selesai' : 'Sedang diproses'}</strong>. Tahap terakhir: {q.data.posisi}.</div>
              <ol className="steps">
                {q.data.steps.map((s, i) => {
                  const lastDone = q.data.steps.filter((x) => x.done).length - 1 === i;
                  return (
                    <li key={s.key} className={`${s.done ? 'done' : ''}${lastDone && !q.data.selesai ? ' now' : ''}`}>
                      <span className="dot" aria-hidden="true">{s.done && <Icon name="check" size={14} />}</span>
                      <span><span className="lbl">{s.label}<span className="sr-only">{s.done ? ', selesai' : ', belum'}</span></span>{s.tanggal && <span className="when" style={{ display: 'block' }}>{fmtDate(s.tanggal)}</span>}</span>
                    </li>
                  );
                })}
              </ol>
            </section>
            <p className="small muted">Halaman ini hanya menampilkan tahapan umum. Rincian internal tidak ditampilkan. Jangan bagikan tautan ini ke pihak yang tidak berkepentingan.</p>
          </>
        )}
        <p className="small"><Link to="/">Masuk sebagai pegawai</Link></p>
      </div>
    </main>
  );
}
