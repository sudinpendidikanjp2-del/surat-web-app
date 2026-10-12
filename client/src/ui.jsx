import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { animate } from 'motion';
import { get, post } from './api.js';
import { STATUS_IN, STATUS_OUT, STATUS_TASK, STATUS_DISP, fmtDateTime, fmtSize } from './format.js';

/* ---------- Ikon: glif sederhana, dipakai hanya bila artinya jelas ---------- */
const PATHS = {
  search: 'M11 4a7 7 0 1 0 4.2 12.6l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z',
  bell: 'M12 3a6 6 0 0 0-6 6v3.6L4.3 15.3A1 1 0 0 0 5 17h14a1 1 0 0 0 .7-1.7L18 12.6V9a6 6 0 0 0-6-6Zm-2 16a2 2 0 0 0 4 0h-4Z',
  menu: 'M4 7h16v2H4V7Zm0 4h16v2H4v-2Zm0 4h16v2H4v-2Z',
  close: 'm6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z',
  check: 'm9.5 16.2-4-4 1.4-1.4 2.6 2.6 7.6-7.6 1.4 1.4-9 9Z',
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm-1-5h2v3h-2V2Zm0 17h2v3h-2v-3ZM2 11h3v2H2v-2Zm17 0h3v2h-3v-2ZM5.2 3.8l2.1 2.1-1.4 1.4-2.1-2.1 1.4-1.4Zm13.5 13.5 2.1 2.1-1.4 1.4-2.1-2.1 1.4-1.4ZM3.8 18.8l2.1-2.1 1.4 1.4-2.1 2.1-1.4-1.4ZM16.7 5.9l2.1-2.1 1.4 1.4-2.1 2.1-1.4-1.4Z',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
};
export function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}

/* ---------- Penanda ---------- */
export function Tag({ tone = 'neutral', children }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}
const tagFrom = (map) => function StatusTag({ status }) {
  const [label, tone] = map[status] || [status, 'neutral'];
  return <Tag tone={tone}>{label}</Tag>;
};
export const StatusIn = tagFrom(STATUS_IN);
export const StatusOut = tagFrom(STATUS_OUT);
export const StatusTask = tagFrom(STATUS_TASK);
export const StatusDisp = tagFrom(STATUS_DISP);

export function Sla({ sla }) {
  if (!sla || sla.level === 'none') return <span className="sla sla-none">Tanpa tenggat</span>;
  return <span className={`sla sla-${sla.level}`}>{sla.label}</span>;
}
export const Stamp = ({ children }) => <span className="stamp">{children}</span>;

export function Progress({ value, label }) {
  const [v, setV] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => setV(value)); return () => cancelAnimationFrame(id); }, [value]);
  return (
    <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label || 'Progres'}>
      <span style={{ transform: `scaleX(${v / 100})` }} />
    </div>
  );
}

/** Tahapan berurutan dengan tanda centang. items: { key, label, done } */
export function Stages({ items, label, compact }) {
  return (
    <ol className={`stages${compact ? ' stages-1' : ''}`} aria-label={label}>
      {items.map((s) => (
        <li key={s.key} className={s.done ? 'done' : ''}>
          <span className="stage-mark" aria-hidden="true">{s.done && <Icon name="check" size={12} />}</span>
          <span>{s.label}<span className="sr-only">{s.done ? ', selesai' : ', belum'}</span></span>
        </li>
      ))}
    </ol>
  );
}

/** Satu angka pada buku ringkasan (ledger). Menjadi tautan bila `to` diisi. */
export function Figure({ to, n, cap, lead, late }) {
  const inner = <><span className="figure">{n ?? 0}</span><span className="cap">{cap}</span></>;
  const cls = `ledger-item${lead ? ' lead' : ''}${late && n > 0 ? ' is-late' : ''}`;
  return to ? <Link to={to} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

/** Kartu "Langkah berikutnya": satu kalimat, satu tombol utama, sisanya di menu. */
export function NextStep({ step, busy, children }) {
  const p = step.primary;
  return (
    <section className={`next-step${step.quiet ? ' quiet' : ''}`} aria-label="Langkah berikutnya">
      <div><h2>{step.title}</h2>{step.desc && <p>{step.desc}</p>}</div>
      <div className="actions no-print">
        {p && (p.to ? <Link className="btn btn-primary" to={p.to}>{p.label}</Link>
          : p.href ? <a className="btn btn-primary" href={p.href}>{p.label}</a>
            : <button type="button" className="btn btn-primary" disabled={busy} onClick={p.onClick}>{p.label}</button>)}
        {children}
      </div>
    </section>
  );
}

/* ---------- Form ---------- */
export function Field({ label, hint, error, span2, children, id }) {
  const auto = useId();
  const fid = id || auto;
  const child = typeof children === 'function' ? children(fid, error) : children;
  return (
    <div className={`field${span2 ? ' span-2' : ''}`}>
      <label htmlFor={fid}>{label}</label>
      {child}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="err" role="alert">{error}</span>}
    </div>
  );
}
/** Kelompok isian tanpa bingkai bawaan peramban. */
export function Group({ legend, children }) {
  return <fieldset className="group"><legend className="label">{legend}</legend>{children}</fieldset>;
}
export const Input = ({ id, error, ...p }) => <input id={id} className="input" aria-invalid={error ? 'true' : undefined} {...p} />;
export const Textarea = ({ id, error, ...p }) => <textarea id={id} className="input" aria-invalid={error ? 'true' : undefined} {...p} />;
export const Select = ({ id, error, options, placeholder, ...p }) => (
  <select id={id} className="input" aria-invalid={error ? 'true' : undefined} {...p}>
    {placeholder && <option value="">{placeholder}</option>}
    {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
  </select>
);

/** Input file dengan area seret. Tetap berupa <input type=file> asli agar dapat dioperasikan keyboard. */
export function FilePicker({ files, setFiles, multiple = true, accept, label = 'Pilih file atau seret ke sini' }) {
  const [over, setOver] = useState(false);
  const id = useId();
  const add = (list) => { const arr = [...list]; setFiles(multiple ? [...files, ...arr] : arr.slice(0, 1)); };
  return (
    <div>
      <div
        className={`drop${over ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
      >
        <label htmlFor={id} className="drop-label">{label}</label>
        <input id={id} type="file" multiple={multiple} accept={accept} onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      </div>
      {files.length > 0 && (
        <ul className="file-list file-list-picked">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <span className="file-name">{f.name} <span className="muted small">{fmtSize(f.size)}</span></span>
              <button type="button" className="btn btn-sm btn-quiet" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Hapus ${f.name}`}>Hapus</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Toast ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setItems((x) => [...x, { id, message, error: opts.error }]);
    // Keluar lebih cepat dari masuk (160 ms vs 220 ms): sistem sedang merespons, pengguna tidak sedang menunggu.
    setTimeout(() => setItems((x) => x.map((t) => (t.id === id ? { ...t, leaving: true } : t))), opts.error ? 6000 : 3500);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), (opts.error ? 6000 : 3500) + 160);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast${t.error ? ' error' : ''}`} data-leaving={t.leaving ? 'true' : undefined}>{t.message}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

/** Aksi ke server dengan toast hasil dan penyegaran data. keys: daftar queryKey prefix yang di-invalidate. */
export function useAction(fn, { success, keys = [], onDone } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (data, vars) => {
      await Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [].concat(k) })));
      if (success) toast(typeof success === 'function' ? success(data, vars) : success);
      onDone?.(data, vars);
    },
    onError: (e) => toast(e.message, { error: true }),
  });
}

/* ---------- Sheet: panel samping di desktop, lembar bawah di ponsel ---------- */
const project = (v, rate = 0.998) => ((v / 1000) * rate) / (1 - rate);
const rubber = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

export function Sheet({ title, onClose, children, footer, wide }) {
  const sheetRef = useRef(null);
  const scrimRef = useRef(null);
  const posRef = useRef(0);
  const ctrl = useRef(null);
  const closing = useRef(false);
  const titleId = useId();
  const isMobile = () => matchMedia('(max-width: 900px)').matches;
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const axis = () => (isMobile() ? 'Y' : 'X');
  const size = () => (axis() === 'Y' ? sheetRef.current.offsetHeight : sheetRef.current.offsetWidth);
  const paint = (v) => {
    if (!sheetRef.current) return;
    posRef.current = v;
    sheetRef.current.style.transform = `translate${axis()}(${v}px)`;
    if (scrimRef.current) scrimRef.current.style.opacity = String(Math.max(0, 1 - v / size()));
  };

  // Masuk 300 ms, keluar 220 ms: keluar lebih cepat karena sistem sedang merespons, bukan pengguna sedang memutuskan.
  const move = (to, velocity = 0, then, duration = 0.3) => {
    ctrl.current?.stop();
    if (reduce()) { paint(to); then?.(); return; }
    ctrl.current = animate(posRef.current, to, { type: 'spring', bounce: 0, duration, velocity, onUpdate: paint, onComplete: then });
  };

  const requestClose = (velocity = 0, instant = false) => {
    if (closing.current) return;
    closing.current = true;
    // Tutup lewat keyboard (Escape) tanpa animasi: tindakan keyboard terasa lambat bila dianimasikan.
    if (instant) { onClose(); return; }
    move(size() + 8, velocity, onClose, 0.22);
  };

  useLayoutEffect(() => {
    paint(size() + 8);
    move(0);
    const prev = document.activeElement;
    const el = sheetRef.current;
    // Di layar sentuh fokus ke panel saja: memfokus isian langsung memunculkan papan ketik dan menutupi panel yang sedang naik.
    const touch = matchMedia('(pointer: coarse)').matches;
    const first = (!touch && el.querySelector('input:not([type=hidden]), select, textarea, button.btn-primary')) || el;
    first.focus({ preventScroll: true });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; ctrl.current?.stop(); prev?.focus?.({ preventScroll: true }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); requestClose(0, true); return; }
    if (e.key !== 'Tab') return;
    const f = [...sheetRef.current.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
    if (!f.length) return;
    const a = f[0]; const z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  };

  /* Seret untuk menutup: 1:1 mengikuti jari, kecepatan dibawa ke pegas, tujuan dipilih dari proyeksi momentum. */
  const drag = useRef(null);
  const onDown = (e) => {
    if (e.target.closest('button')) return;
    ctrl.current?.stop();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = axis() === 'Y' ? e.clientY : e.clientX;
    drag.current = { start: p, base: posRef.current, hist: [{ p, t: e.timeStamp }] };
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const p = axis() === 'Y' ? e.clientY : e.clientX;
    d.hist.push({ p, t: e.timeStamp });
    if (d.hist.length > 6) d.hist.shift();
    const raw = d.base + (p - d.start);
    paint(raw < 0 ? -rubber(-raw, size()) : raw);
  };
  const onUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const a = d.hist[0]; const b = d.hist[d.hist.length - 1];
    const v = b.t > a.t ? ((b.p - a.p) / (b.t - a.t)) * 1000 : 0;
    const landing = posRef.current + project(v);
    if (landing > size() * 0.5) requestClose(v); else move(0, v);
  };

  return (
    <>
      <div ref={scrimRef} className="scrim" onClick={() => requestClose()} aria-hidden="true" />
      <div ref={sheetRef} className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKey} data-wide={wide ? 'true' : undefined}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="btn btn-quiet icon-btn" onClick={() => requestClose()} aria-label="Tutup"><Icon name="close" /></button>
        </div>
        {typeof children === 'function' ? children({ close: requestClose }) : children}
        {footer && <div className="sheet-foot">{typeof footer === 'function' ? footer({ close: requestClose }) : footer}</div>}
      </div>
    </>
  );
}

export const SheetBody = ({ children }) => <div className="sheet-body">{children}</div>;

/** Kaki panel: Batal di kiri, tindakan utama di kanan, merah bila merusak. */
export function SheetFoot({ close, pending, label, onSubmit, danger }) {
  return (
    <>
      <button type="button" className="btn" onClick={() => close()}>Batal</button>
      <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={pending} onClick={onSubmit}>{pending ? 'Memproses…' : label}</button>
    </>
  );
}

/* ---------- Status data: memuat, galat, kosong ---------- */
export function Loading({ rows = 3 }) {
  return (
    <div className="state" aria-busy="true" aria-live="polite">
      <span className="sr-only">Memuat data</span>
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="skeleton" style={{ width: `${88 - i * 14}%`, height: 14 }} />)}
    </div>
  );
}
export function ErrorState({ error, retry }) {
  return (
    <div className="state" role="alert">
      <strong>Data tidak dapat dimuat</strong>
      <span>{error?.message || 'Terjadi kesalahan'}</span>
      {retry && <button type="button" className="btn btn-sm" onClick={retry}>Coba lagi</button>}
    </div>
  );
}
export function Empty({ title, text, action }) {
  return (
    <div className="state">
      <strong>{title}</strong>
      {text && <span>{text}</span>}
      {action}
    </div>
  );
}
/** Membungkus useQuery: loading, galat, kosong, lalu isi. */
export function Async({ q, isEmpty, empty, rows, children }) {
  if (q.isLoading) return <Loading rows={rows} />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data;
  const blank = isEmpty ? isEmpty(d) : Array.isArray(d) && d.length === 0;
  if (blank) return empty || <Empty title="Belum ada data" />;
  return children(d);
}

/** Tab ARIA: panah kiri/kanan, Home, End berpindah tab; hanya tab aktif yang masuk urutan Tab. */
export function Tabs({ tabs, value, onChange, label }) {
  const onKey = (e) => {
    const i = tabs.findIndex((t) => t.key === value);
    const n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (n === undefined) return;
    e.preventDefault();
    const next = tabs[(n + tabs.length) % tabs.length];
    onChange(next.key);
    e.currentTarget.querySelector(`#tab-${next.key}`)?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" id={`tab-${t.key}`} aria-selected={value === t.key} aria-controls={`panel-${t.key}`} tabIndex={value === t.key ? 0 : -1} className="tab" onClick={() => onChange(t.key)}>
          {t.label}{t.count != null ? ` (${t.count})` : ''}
        </button>
      ))}
    </div>
  );
}

export function PageHead({ title, sub, children }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}

export function FileList({ files, empty = 'Belum ada dokumen' }) {
  if (!files.length) return <p className="muted">{empty}</p>;
  return (
    <ul className="file-list">
      {files.map((f) => (
        <li key={f.id}>
          <div>
            <a className="file-name" href={`/api/files/${f.id}`} target="_blank" rel="noreferrer">{f.nama}</a>
            <div className="muted small">{f.kategori} · v{f.versi} · {fmtSize(f.ukuran)} · {f.uploader || 'Sistem'}</div>
          </div>
          <a className="btn btn-sm" href={`/api/files/${f.id}?unduh=1`}>Unduh</a>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Riwayat dan diskusi: satu komponen untuk surat masuk dan keluar ---------- */
const renderText = (t) => t.split(/(@[a-z0-9._-]+)/gi).map((p, i) => (p.startsWith('@') ? <strong key={i}>{p}</strong> : p));

export function Discussion({ queryKey, base, canWrite, label, fieldLabel = 'Tambah catatan atau komentar' }) {
  const q = useQuery({ queryKey, queryFn: () => get(`${base}/timeline`) });
  const [teks, setTeks] = useState('');
  const act = useAction(() => post(`${base}/komentar`, { teks }), { keys: ['timeline'], onDone: () => setTeks('') });
  return (
    <div className="stack stack-lg">
      {canWrite && (
        <form onSubmit={(e) => { e.preventDefault(); if (teks.trim()) act.mutate(); }} className="stack">
          <Field label={fieldLabel} hint="Gunakan @namapengguna untuk menyebut rekan, misalnya @andi.">{(fid) => <Textarea id={fid} rows={2} value={teks} onChange={(e) => setTeks(e.target.value)} />}</Field>
          <div><button type="submit" className="btn btn-primary btn-sm" disabled={act.isPending || !teks.trim()}>{act.isPending ? 'Mengirim…' : 'Kirim Catatan'}</button></div>
        </form>
      )}
      <Async q={q} empty={<Empty title="Belum ada riwayat" />}>
        {(rows) => (
          <ol className="thread" aria-label={label}>
            {[...rows].reverse().map((e) => (
              <li key={e.id} className={`t-${e.tipe}`}>
                <div className="when">{fmtDateTime(e.created_at)}{e.user_nama ? ` · ${e.user_nama}` : ''}</div>
                {e.tipe === 'komentar' ? <div className="comment-text">{renderText(e.teks)}</div> : <div>{e.teks}</div>}
              </li>
            ))}
          </ol>
        )}
      </Async>
    </div>
  );
}
