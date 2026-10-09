import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, qs } from './api.js';
import { Empty, ErrorState, Field, Icon, Input, Loading, PageHead, Select, Sheet, useToast } from './ui.jsx';

/* ======================================================================
   Primitif: popover, menu, dialog konfirmasi
   ====================================================================== */
export function Popover({ trigger, children, align = 'right', wide = false, label }) {
  const [open, setOpen] = useState(false);
  const [instant, setInstant] = useState(false);
  const ref = useRef(null);
  const btn = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div className="pop-wrap" ref={ref}>
      {trigger({
        ref: btn,
        'aria-expanded': open,
        'aria-haspopup': 'true',
        // Dibuka dengan keyboard (detail 0): tanpa animasi, karena tindakan keyboard sering dan harus terasa langsung.
        onClick: (e) => { setInstant(e.detail === 0); setOpen((o) => !o); },
      })}
      {open && (
        <div className={`pop${align === 'left' ? ' left' : ''}${wide ? ' wide' : ''}${instant ? ' instant' : ''}`} role={wide ? 'dialog' : 'menu'} aria-label={label}>
          {typeof children === 'function' ? children({ close }) : children}
        </div>
      )}
    </div>
  );
}

/** Menu aksi. items: { label, onClick?, to?, danger?, disabled?, sep? } */
export function Menu({ label = 'Aksi lain', items, align = 'right', className = 'btn', icon }) {
  const nav = useNavigate();
  const visible = items.filter(Boolean);
  const onKey = (e) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const els = [...e.currentTarget.querySelectorAll('[role=menuitem]:not([disabled])')];
    if (!els.length) return;
    e.preventDefault();
    const i = els.indexOf(document.activeElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? els.length - 1 : e.key === 'ArrowDown' ? (i + 1) % els.length : (i - 1 + els.length) % els.length;
    els[next].focus();
  };
  return (
    <Popover align={align} label={label} trigger={(p) => <button type="button" className={className} {...p}>{icon}{label}</button>}>
      {({ close }) => (
        <div onKeyDown={onKey} ref={(el) => el?.querySelector('[role=menuitem]:not([disabled])')?.focus({ preventScroll: true })}>
          {visible.map((it, i) => (it.sep ? <div key={`s${i}`} className="menu-sep" role="separator" /> : (
            <button key={it.label} type="button" role="menuitem" className={`menu-item${it.danger ? ' danger' : ''}`} disabled={it.disabled}
              onClick={() => { close(); if (it.to) nav(it.to); else it.onClick?.(); }}>{it.label}</button>
          )))}
        </div>
      )}
    </Popover>
  );
}

/** Dialog modal bawaan peramban: fokus terkunci, Escape menutup, latar tidak dapat diklik. */
export function Dialog({ title, children, onClose, footer }) {
  const ref = useRef(null);
  const tid = useId();
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); return () => { if (d?.open) d.close(); }; }, []);
  return (
    <dialog ref={ref} className="dlg" aria-labelledby={tid} onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current.close(); }}>
      <div className="dlg-body"><h2 id={tid}>{title}</h2>{children}</div>
      <div className="dlg-foot">{typeof footer === 'function' ? footer({ close: () => ref.current?.close() }) : footer}</div>
    </dialog>
  );
}

export function ConfirmDialog({ title, children, confirmLabel = 'Lanjutkan', tone, pending, onConfirm, onClose }) {
  return (
    <Dialog title={title} onClose={onClose} footer={({ close }) => (
      <>
        <button type="button" className="btn" onClick={close}>Batal</button>
        <button type="button" className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} disabled={pending} onClick={onConfirm}>{pending ? 'Memproses...' : confirmLabel}</button>
      </>
    )}>
      {children}
    </Dialog>
  );
}

export function ResultDialog({ title, result, labelOf, onClose }) {
  const failed = result.results.filter((r) => !r.ok);
  return (
    <Dialog title={title} onClose={onClose} footer={({ close }) => <button type="button" className="btn btn-primary" onClick={close}>Mengerti</button>}>
      <p><strong>{result.ok} berhasil</strong>{result.gagal > 0 ? `, ${result.gagal} gagal. Yang gagal tidak diubah.` : '.'}</p>
      {failed.length > 0 && (
        <ul className="result-list" aria-label="Data yang gagal">
          {failed.map((f) => <li key={f.id}><span>{labelOf?.(f.id) || `#${f.id}`}</span><span className="muted">{f.error}</span></li>)}
        </ul>
      )}
    </Dialog>
  );
}

/* ======================================================================
   Keadaan daftar di URL: halaman, urutan, saringan. Tombol kembali dan tautan tetap bermakna.
   ====================================================================== */
export function useListParams(filterKeys, defaults = {}) {
  const [sp, setSp] = useSearchParams();
  const all = useMemo(() => [...filterKeys, 'q', 'page', 'pageSize', 'sort', 'dir'], [filterKeys]);
  const params = useMemo(() => Object.fromEntries(all.map((k) => [k, sp.get(k) ?? defaults[k] ?? ''])), [sp, all, defaults]);
  const write = useCallback((next) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v !== '' && v != null && String(v) !== String(defaults[k] ?? '')) p.set(k, v);
    setSp(p, { replace: true });
  }, [setSp, defaults]);
  const set = useCallback((patch) => write({ ...params, ...(('page' in patch) ? {} : { page: '' }), ...patch }), [params, write]);
  const reset = useCallback(() => write({ pageSize: params.pageSize, sort: params.sort, dir: params.dir, scope: params.scope }), [params, write]);
  return { params, set, reset };
}

export function useSelection() {
  const [sel, setSel] = useState(() => new Set());
  return {
    sel,
    size: sel.size,
    has: (id) => sel.has(id),
    toggle: (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    setMany: (ids, on) => setSel((s) => { const n = new Set(s); for (const id of ids) { if (on) n.add(id); else n.delete(id); } return n; }),
    replace: (ids) => setSel(new Set(ids)),
    clear: () => setSel(new Set()),
  };
}

/* ======================================================================
   Tabel data, halaman, bilah aksi massal
   ====================================================================== */
export function DataTable({ columns, rows, rowId = (r) => r.id, selection, sort, onSort, rowTo, onOpen, busy, label }) {
  const nav = useNavigate();
  const allRef = useRef(null);
  const ids = rows.map(rowId);
  const onPage = selection ? ids.filter((id) => selection.has(id)).length : 0;
  useEffect(() => { if (allRef.current) allRef.current.indeterminate = onPage > 0 && onPage < ids.length; });
  const open = (e, row) => {
    if ((!rowTo && !onOpen) || e.target.closest('a,button,input,label,select,textarea')) return;
    if (onOpen) onOpen(row); else nav(rowTo(row));
  };
  return (
    <div className="dt-wrap table-wrap" aria-busy={busy ? 'true' : 'false'}>
      {selection && (
        <label className="mobile-select check-row">
          <input type="checkbox" checked={ids.length > 0 && onPage === ids.length} onChange={(e) => selection.setMany(ids, e.target.checked)} />
          <span>Pilih semua baris di halaman ini</span>
        </label>
      )}
      <table className="table stackable" aria-label={label}>
        <thead>
          <tr>
            {selection && <th className="sel"><input ref={allRef} type="checkbox" aria-label="Pilih semua di halaman ini" checked={ids.length > 0 && onPage === ids.length} onChange={(e) => selection.setMany(ids, e.target.checked)} /></th>}
            {columns.map((c) => (
              c.sort ? (
                <th key={c.key} className="sortable" aria-sort={sort?.key === c.sort ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => onSort(c.sort)}>{c.header}<span aria-hidden="true">{sort?.key === c.sort ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</span></button>
                </th>
              ) : <th key={c.key}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const id = rowId(r);
            return (
              <tr key={id} className={rowTo || onOpen ? 'row-link' : undefined} data-selected={selection?.has(id) ? 'true' : undefined} onClick={(e) => open(e, r)}>
                {selection && <td className="sel"><input type="checkbox" aria-label={`Pilih ${c0(columns, r)}`} checked={selection.has(id)} onChange={() => selection.toggle(id)} /></td>}
                {columns.map((c) => <td key={c.key} className={c.primary ? 'primary' : c.className} data-label={c.primary ? undefined : (c.mobileLabel ?? c.header)}>{c.cell(r)}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
const c0 = (columns, r) => { const t = columns.find((c) => c.title)?.title?.(r); return t || 'baris ini'; };

function pageList(page, last) {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  const out = new Set([1, last, page - 1, page, page + 1]);
  if (page <= 3) { out.add(2); out.add(3); out.add(4); }
  if (page >= last - 2) { out.add(last - 1); out.add(last - 2); out.add(last - 3); }
  const sorted = [...out].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b);
  const res = [];
  sorted.forEach((n, i) => { if (i && n - sorted[i - 1] > 1) res.push('…'); res.push(n); });
  return res;
}

export function Pagination({ page, pageSize, total, onPage, onSize, sizes = [10, 20, 50, 100] }) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const id = useId();
  return (
    <nav className="pager" aria-label="Halaman data">
      <div className="row" style={{ gap: 10 }}>
        <span className="muted small" aria-live="polite">Menampilkan <strong className="num">{from}-{to}</strong> dari <strong className="num">{total}</strong></span>
        <label className="sr-only" htmlFor={id}>Baris per halaman</label>
        <select id={id} className="input" value={pageSize} onChange={(e) => onSize(Number(e.target.value))}>
          {sizes.map((s) => <option key={s} value={s}>{s} per halaman</option>)}
        </select>
      </div>
      <div className="pages">
        <button type="button" className="pg" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Halaman sebelumnya">Sebelumnya</button>
        {pageList(page, last).map((n, i) => (n === '…' ? <span key={`e${i}`} className="muted" aria-hidden="true">…</span> : (
          <button key={n} type="button" className="pg" aria-current={n === page ? 'page' : undefined} aria-label={`Halaman ${n}`} onClick={() => onPage(n)}>{n}</button>
        )))}
        <button type="button" className="pg" disabled={page >= last} onClick={() => onPage(page + 1)} aria-label="Halaman berikutnya">Berikutnya</button>
      </div>
    </nav>
  );
}

export function BulkBar({ count, total, allResults, truncated, onSelectResults, onClear, children }) {
  return (
    <div className="bulkbar" role="region" aria-label="Aksi untuk data terpilih">
      <span className="count" aria-live="polite">{count} dipilih</span>
      {!allResults && onSelectResults && total > count && <button type="button" className="link" onClick={onSelectResults}>Pilih semua {total} hasil</button>}
      {allResults && truncated && <span className="small">Dibatasi 500 data pertama</span>}
      <span className="grow" />
      {children}
      <button type="button" className="link" onClick={onClear}>Batalkan pilihan</button>
    </div>
  );
}

/** Menjalankan aksi massal: hasil per data, toast ringkas, dan dialog rinci bila ada yang gagal. */
export function useBulk({ keys = [], labelOf }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [result, setResult] = useState(null);
  const m = useMutation({
    mutationFn: ({ url, ids, body }) => post(url, { ...(body || {}), ids }),
    onSuccess: async (res, vars) => {
      await Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [].concat(k) })));
      if (res.gagal === 0) toast(`${res.ok} data berhasil diproses`);
      else setResult({ ...res, title: vars.title });
      vars.onDone?.(res);
    },
    onError: (e) => toast(e.message, { error: true }),
  });
  const dialog = result ? <ResultDialog title={result.title || 'Hasil aksi massal'} result={result} labelOf={labelOf} onClose={() => setResult(null)} /> : null;
  return { run: m.mutate, pending: m.isPending, dialog };
}

/* ======================================================================
   Saringan
   ====================================================================== */
function valueLabel(f, v) {
  if (f.type === 'multi') return v.split(',').map((x) => f.options.find((o) => (o.value ?? o) === x)?.label ?? x).join(', ');
  if (f.type === 'select') return f.options.find((o) => (o.value ?? o) === v)?.label ?? v;
  return v;
}

function FilterFields({ filters, params, set }) {
  return filters.map((f) => {
    if (f.type === 'multi') {
      const cur = params[f.key] ? params[f.key].split(',') : [];
      return (
        <fieldset key={f.key} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">{f.label}</legend>
          {f.options.map((o) => {
            const v = o.value ?? o;
            return <label key={v} className="check-row" style={{ minHeight: 32, padding: '3px 0' }}><input type="checkbox" checked={cur.includes(v)} onChange={() => set({ [f.key]: (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]).join(',') })} /><span>{o.label ?? o}</span></label>;
          })}
        </fieldset>
      );
    }
    if (f.type === 'date') return <Field key={f.key} label={f.label}>{(id) => <Input id={id} type="date" value={params[f.key]} onChange={(e) => set({ [f.key]: e.target.value })} />}</Field>;
    return <Field key={f.key} label={f.label}>{(id) => <Select id={id} value={params[f.key]} onChange={(e) => set({ [f.key]: e.target.value })} placeholder="Semua" options={f.options} />}</Field>;
  });
}

function SearchBox({ value, onChange, placeholder }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  useEffect(() => { if (v === value) return undefined; const t = setTimeout(() => onChange(v), 300); return () => clearTimeout(t); }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const id = useId();
  return (
    <div className="search">
      <Icon name="search" size={18} />
      <label className="sr-only" htmlFor={id}>Cari</label>
      <input id={id} className="input" type="search" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} />
    </div>
  );
}

/* ======================================================================
   ListView: satu pola daftar untuk semua halaman data
   ====================================================================== */
export function ListView({
  title, sub, actions, queryKey, endpoint, filters = [], tabs = [], columns, rowTo, onOpen, bulk = [], csv = false, idsEndpoint,
  empty, defaults = {}, searchPlaceholder = 'Cari', selectable = true, labelOf, extraKeys = [], tableLabel,
}) {
  const filterKeys = useMemo(() => [...filters.map((f) => f.key), ...extraKeys], [filters, extraKeys]);
  const dflt = useMemo(() => ({ pageSize: '20', ...defaults }), [defaults]);
  const { params, set, reset } = useListParams(filterKeys, dflt);
  const selection = useSelection();
  const [confirm, setConfirm] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [allSel, setAllSel] = useState({ all: false, truncated: false });
  const toast = useToast();
  const q = useQuery({ queryKey: [queryKey, params], queryFn: () => get(`${endpoint}${qs(params)}`), placeholderData: keepPreviousData });
  const rows = q.data?.items || [];
  const sig = JSON.stringify(filterKeys.map((k) => params[k]).concat(params.q));
  useEffect(() => { selection.clear(); setAllSel({ all: false, truncated: false }); }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const labelFor = labelOf || ((id) => rows.find((r) => r.id === id)?.no_agenda || `#${id}`);
  const bulkRunner = useBulk({ keys: [queryKey, 'dashboard', 'letter', 'letters-in', 'letters-out', 'tasks', 'dispositions', 'users', 'notif-count'], labelOf: labelFor });

  const sort = { key: params.sort || dflt.sort, dir: params.dir || dflt.dir || 'desc' };
  const onSort = (key) => set({ sort: key, dir: sort.key === key && sort.dir === 'asc' ? 'desc' : 'asc' });
  const activeFilters = filters.filter((f) => params[f.key] && String(params[f.key]) !== String(dflt[f.key] ?? ''));
  const filterCount = activeFilters.length;
  // tab cepat yang aktif (mis. Terlambat) juga mempersempit hasil, jadi keadaan kosong harus menyebut itu, bukan "belum ada data"
  const narrowed = filterKeys.some((k) => params[k] && String(params[k]) !== String(dflt[k] ?? '')) || Boolean(params.q);

  const selectAllResults = async () => {
    try {
      const r = await get(`${idsEndpoint}${qs(Object.fromEntries(Object.entries(params).filter(([k]) => !['page', 'pageSize', 'sort', 'dir'].includes(k))))}`);
      selection.replace(r.ids);
      setAllSel({ all: true, truncated: r.terpotong });
    } catch (e) { toast(e.message, { error: true }); }
  };

  const ids = [...selection.sel];
  const runBulkAction = (a, extra) => {
    bulkRunner.run({ url: a.url, ids, body: { ...(a.body || {}), ...(extra || {}) }, title: a.label, onDone: () => { selection.clear(); setAllSel({ all: false, truncated: false }); setConfirm(null); setSheet(null); } });
  };
  const visibleBulk = bulk.filter((a) => !a.show || a.show(rows));
  const onAction = (a) => {
    if (a.sheet) setSheet(a);
    else if (a.confirm) setConfirm(a);
    else runBulkAction(a);
  };

  const tabActive = (t) => Object.entries(t.patch).every(([k, v]) => String(params[k] ?? '') === String(v));
  const csvHref = csv ? `/api${endpoint}${qs({ ...params, format: 'csv', page: '', pageSize: '' })}` : null;

  return (
    <div className="page">
      <PageHead title={title} sub={sub}>{actions}</PageHead>
      <div className="stack" style={{ gap: 12 }}>
        {tabs.length > 0 && (
          <div className="seg" role="group" aria-label="Tampilan cepat">
            {tabs.map((t) => <button key={t.label} type="button" aria-pressed={tabActive(t)} onClick={() => set(t.patch)}>{t.label}</button>)}
          </div>
        )}
        <div className="toolbar">
          {searchPlaceholder ? <SearchBox value={params.q} onChange={(v) => set({ q: v })} placeholder={searchPlaceholder} /> : null}
          {filters.length > 0 && (
            <Popover align="left" wide label="Saringan" trigger={(p) => <button type="button" className="btn" {...p}>Saringan{filterCount ? ` (${filterCount})` : ''}</button>}>
              {() => (
                <>
                  <FilterFields filters={filters} params={params} set={set} />
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <button type="button" className="btn btn-sm btn-quiet" onClick={reset} disabled={!filterCount && !params.q}>Atur ulang</button>
                  </div>
                </>
              )}
            </Popover>
          )}
          <span className="grow" />
          {csvHref && <a className="btn" href={csvHref}>Ekspor CSV</a>}
        </div>
        {(filterCount > 0 || params.q) && (
          <div className="active-filters" aria-label="Saringan aktif">
            {params.q && <span className="fchip">Kata kunci: {params.q}<button type="button" aria-label="Hapus kata kunci" onClick={() => set({ q: '' })}><Icon name="close" size={14} /></button></span>}
            {activeFilters.map((f) => <span key={f.key} className="fchip">{f.label}: {valueLabel(f, params[f.key])}<button type="button" aria-label={`Hapus saringan ${f.label}`} onClick={() => set({ [f.key]: '' })}><Icon name="close" size={14} /></button></span>)}
            <button type="button" className="btn btn-sm btn-quiet" onClick={reset}>Atur ulang semua</button>
          </div>
        )}
      </div>

      <div className="card">
        {q.isLoading ? <Loading rows={6} /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : rows.length === 0 ? (
          narrowed ? <Empty title="Tidak ada data yang cocok" text="Ubah kata kunci, saringan, atau tampilan cepat di atas." action={<button type="button" className="btn btn-sm" onClick={reset}>Atur ulang saringan</button>} /> : (empty || <Empty title="Belum ada data" />)
        ) : (
          <>
            <DataTable columns={columns} rows={rows} selection={selectable && bulk.length ? selection : undefined} sort={sort} onSort={onSort} rowTo={rowTo} onOpen={onOpen} busy={q.isFetching && q.isPlaceholderData} label={tableLabel || title} />
            <Pagination page={Number(q.data.page)} pageSize={Number(q.data.pageSize)} total={q.data.total} onPage={(p) => set({ page: p })} onSize={(s) => set({ pageSize: String(s) })} />
          </>
        )}
      </div>
      {selection.size > 0 && <div className="pad-bottom" aria-hidden="true" />}

      {selection.size > 0 && (
        <BulkBar count={selection.size} total={q.data?.total || 0} allResults={allSel.all} truncated={allSel.truncated} onSelectResults={idsEndpoint ? selectAllResults : undefined} onClear={() => { selection.clear(); setAllSel({ all: false, truncated: false }); }}>
          {visibleBulk.map((a) => <button key={a.key} type="button" className={`btn ${a.tone === 'primary' ? 'btn-primary' : a.tone === 'danger' ? 'btn-danger' : ''}`} disabled={bulkRunner.pending} onClick={() => onAction(a)}>{a.label}</button>)}
        </BulkBar>
      )}
      {confirm && (
        <ConfirmDialog title={typeof confirm.confirm.title === 'function' ? confirm.confirm.title(selection.size) : confirm.confirm.title} confirmLabel={confirm.confirm.button || confirm.label} tone={confirm.tone}
          pending={bulkRunner.pending} onClose={() => setConfirm(null)} onConfirm={() => runBulkAction(confirm)}>
          <p>{confirm.confirm.body(selection.size)}</p>
        </ConfirmDialog>
      )}
      {sheet && <sheet.sheet ids={ids} count={ids.length} onClose={() => setSheet(null)} run={(extra) => runBulkAction(sheet, extra)} pending={bulkRunner.pending} />}
      {bulkRunner.dialog}
    </div>
  );
}

export { Link, Sheet };
