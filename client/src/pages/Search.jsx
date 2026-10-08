import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, qs } from '../api.js';
import { Async, Empty, Field, Input, PageHead, Select, Sla, Stamp, Tag } from '../ui.jsx';
import { fmtDate, PRIORITAS, SIFAT, STATUS_IN, STATUS_OUT } from '../format.js';

export function Search() {
  const [sp, setSp] = useSearchParams();
  const f = { q: sp.get('q') || '', jenis: sp.get('jenis') || 'semua', status: sp.get('status') || '', sifat: sp.get('sifat') || '', prioritas: sp.get('prioritas') || '', from: sp.get('from') || '', to: sp.get('to') || '', unit: sp.get('unit') || '', pic: sp.get('pic') || '', tahun: sp.get('tahun') || '' };
  const set = (patch) => { const n = { ...f, ...patch }; const p = {}; for (const [k, v] of Object.entries(n)) if (v && !(k === 'jenis' && v === 'semua')) p[k] = v; setSp(p, { replace: true }); };
  const [adv, setAdv] = useState(Boolean(f.status || f.sifat || f.prioritas || f.from || f.to || f.unit || f.pic || f.tahun));
  const hasFilter = Object.entries(f).some(([k, v]) => v && !(k === 'jenis' && v === 'semua'));
  const q = useQuery({ queryKey: ['search', f], queryFn: () => get(`/search${qs(f)}`), enabled: hasFilter });
  const units = useQuery({ queryKey: ['units'], queryFn: () => get('/units'), enabled: adv });
  const users = useQuery({ queryKey: ['user-options'], queryFn: () => get('/users/options'), enabled: adv });
  const statusOpts = f.jenis === 'keluar' ? STATUS_OUT : f.jenis === 'masuk' ? STATUS_IN : { ...STATUS_IN, ...STATUS_OUT };
  return (
    <div className="page">
      <PageHead title="Pencarian surat" sub="Cari surat masuk dan keluar dari nomor, perihal, pengirim, instruksi disposisi, judul tugas, atau nama dokumen." />
      <form className="card card-pad stack" role="search" onSubmit={(e) => e.preventDefault()}>
        <div className="form-grid">
          <Field label="Kata kunci" span2>{(id) => <Input id={id} type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Contoh: KJP" autoFocus />}</Field>
          <Field label="Jenis surat">{(id) => <Select id={id} value={f.jenis} onChange={(e) => set({ jenis: e.target.value, status: '' })} options={[{ value: 'semua', label: 'Surat masuk dan keluar' }, { value: 'masuk', label: 'Surat masuk' }, { value: 'keluar', label: 'Surat keluar' }]} />}</Field>
          <div className="field" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn" aria-expanded={adv} onClick={() => setAdv(!adv)}>{adv ? 'Sembunyikan Filter Lanjutan' : 'Filter Lanjutan'}</button></div>
        </div>
        {adv && (
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            <Field label="Tanggal dari">{(id) => <Input id={id} type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} />}</Field>
            <Field label="Tanggal sampai">{(id) => <Input id={id} type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} />}</Field>
            <Field label="Tahun">{(id) => <Input id={id} type="number" min="2000" max="2100" value={f.tahun} onChange={(e) => set({ tahun: e.target.value })} />}</Field>
            <Field label="Status">{(id) => <Select id={id} value={f.status} onChange={(e) => set({ status: e.target.value })} placeholder="Semua" options={Object.entries(statusOpts).map(([value, [label]]) => ({ value, label }))} />}</Field>
            <Field label="Sifat (surat masuk)">{(id) => <Select id={id} value={f.sifat} onChange={(e) => set({ sifat: e.target.value })} placeholder="Semua" options={SIFAT} />}</Field>
            <Field label="Prioritas (surat masuk)">{(id) => <Select id={id} value={f.prioritas} onChange={(e) => set({ prioritas: e.target.value })} placeholder="Semua" options={PRIORITAS} />}</Field>
            <Field label="Unit">{(id) => <Select id={id} value={f.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="Semua" options={(units.data || []).map((u) => ({ value: u.id, label: u.nama }))} />}</Field>
            <Field label="PIC atau pembuat">{(id) => <Select id={id} value={f.pic} onChange={(e) => set({ pic: e.target.value })} placeholder="Semua" options={(users.data || []).map((u) => ({ value: u.id, label: u.nama }))} />}</Field>
          </div>
        )}
      </form>
      {!hasFilter ? <Empty title="Mulai dengan kata kunci" text="Ketik nomor surat, perihal, atau nama pengirim. Hasil muncul saat Anda mengetik." /> : (
        <div className="card">
          <Async q={q} empty={<Empty title="Tidak ada surat yang cocok" text="Coba kata kunci lain atau longgarkan filter." />}>
            {(rows) => (
              <div className="table-wrap">
                <table className="table stackable">
                  <thead><tr><th>Jenis</th><th>No. Agenda</th><th>Perihal</th><th>Pihak</th><th>Tanggal</th><th>Status</th></tr></thead>
                  <tbody>{rows.map((r) => (
                    <tr key={`${r.tipe}-${r.id}`}>
                      <td data-label="Jenis"><Tag tone={r.tipe === 'masuk' ? 'accent' : 'neutral'}>{r.tipe === 'masuk' ? 'Masuk' : 'Keluar'}</Tag></td>
                      <td className="primary"><Stamp>{r.no_agenda}</Stamp></td>
                      <td className="primary"><div className="cell-title"><Link to={r.tipe === 'masuk' ? `/surat-masuk/${r.id}` : `/surat-keluar/${r.id}`}>{r.perihal}</Link></div><div className="muted small">{r.nomor || 'Belum bernomor'}</div></td>
                      <td data-label="Pihak">{r.pihak}</td>
                      <td data-label="Tanggal">{fmtDate(r.tanggal)}</td>
                      <td data-label="Status">{r.statusLabel}{r.sla && r.sla.level !== 'selesai' && <div><Sla sla={r.sla} /></div>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Async>
        </div>
      )}
      {q.data && <p className="muted small">{q.data.length} hasil{q.data.length === 200 ? ', ditampilkan terbatas' : ''}.</p>}
    </div>
  );
}

function ArchiveList({ tahun, jenis, bulan, nama }) {
  const q = useQuery({ queryKey: ['arsip-daftar', tahun, jenis, bulan], queryFn: () => get(`/arsip/daftar${qs({ tahun, jenis, bulan })}`) });
  return (
    <Async q={q} empty={<Empty title="Tidak ada surat" />}>
      {(rows) => (
        <ul className="file-list" aria-label={`Surat ${jenis} ${nama} ${tahun}`}>
          {rows.map((r) => (
            <li key={r.id}>
              <div><Link to={jenis === 'masuk' ? `/surat-masuk/${r.id}` : `/surat-keluar/${r.id}`} className="file-name">{r.perihal}</Link><div className="muted small">{r.no_agenda} · {r.nomor || 'belum bernomor'} · {r.pihak} · {fmtDate(r.tanggal)}</div></div>
              <span className="muted small">{r.dokumen} dokumen</span>
            </li>
          ))}
        </ul>
      )}
    </Async>
  );
}

export function Archive() {
  const q = useQuery({ queryKey: ['arsip'], queryFn: () => get('/arsip') });
  const [open, setOpen] = useState({});
  return (
    <div className="page">
      <PageHead title="Arsip digital" sub="Surat tersusun per tahun, jenis, dan bulan. Pencarian tidak bergantung pada struktur ini." />
      <Async q={q} empty={<Empty title="Arsip masih kosong" text="Surat yang dicatat akan tersusun otomatis di sini." />}>
        {(years) => years.map((y) => (
          <section key={y.tahun} className="section" aria-label={`Arsip ${y.tahun}`}>
            <h2>{y.tahun}</h2>
            <div className="split" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
              {[['masuk', 'Surat masuk', y.masuk], ['keluar', 'Surat keluar', y.keluar]].map(([jenis, label, months]) => (
                <div key={jenis} className="card card-pad stack" style={{ gap: 4 }}>
                  <h3>{label}</h3>
                  {months.every((m) => m.jumlah === 0) ? <p className="muted">Tidak ada surat.</p> : months.filter((m) => m.jumlah > 0).map((m) => {
                    const key = `${y.tahun}-${jenis}-${m.bulan}`;
                    return (
                      <div key={key}>
                        <button type="button" className="nav-link" style={{ width: '100%', background: 'none', border: 0, cursor: 'pointer', font: 'inherit', color: 'var(--ink)' }} aria-expanded={Boolean(open[key])} onClick={() => setOpen({ ...open, [key]: !open[key] })}>
                          <span>{m.nama}</span><span className="num muted">{m.jumlah}</span>
                        </button>
                        {open[key] && <ArchiveList tahun={y.tahun} jenis={jenis} bulan={m.bulan} nama={m.nama} />}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        ))}
      </Async>
    </div>
  );
}
