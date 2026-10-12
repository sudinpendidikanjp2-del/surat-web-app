import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, qs } from '../api.js';
import { Async, Empty, Field, Figure, Input, PageHead, Tabs } from '../ui.jsx';

const JENIS = [
  { key: 'surat-masuk', label: 'Surat masuk' },
  { key: 'surat-keluar', label: 'Surat keluar' },
  { key: 'disposisi', label: 'Disposisi' },
  { key: 'tindak-lanjut', label: 'Tindak lanjut' },
  { key: 'kinerja', label: 'Kinerja unit' },
];

export default function Reports() {
  const year = new Date().getFullYear();
  const [jenis, setJenis] = useState('surat-masuk');
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const stat = useQuery({ queryKey: ['statistik'], queryFn: () => get('/statistik') });
  const q = useQuery({ queryKey: ['laporan', jenis, from, to], queryFn: () => get(`/laporan/${jenis}${qs({ from, to })}`) });
  return (
    <div className="page">
      <PageHead title="Laporan" sub="Rekap surat dan kinerja tindak lanjut. Ekspor CSV dapat dibuka di Excel." />
      <Async q={stat} isEmpty={() => false} rows={1}>
        {(s) => (
          <section aria-label={`Statistik ${s.tahun}`} className="ledger ledger-5">
            <Figure n={s.masuk} cap={`Surat masuk ${s.tahun}`} /><Figure n={s.keluar} cap="Surat keluar" /><Figure n={s.disposisi} cap="Disposisi" /><Figure n={s.selesai} cap="Selesai" /><Figure n={s.terlambat} cap="Terlambat" late />
          </section>
        )}
      </Async>
      <div className="card card-pad stack">
        <Tabs label="Jenis laporan" value={jenis} onChange={setJenis} tabs={JENIS} />
        <div className="form-grid form-grid-auto">
          <Field label="Dari tanggal">{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label="Sampai tanggal">{(id) => <Input id={id} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
        </div>
      </div>
      <Async q={q} isEmpty={(d) => d.tables.every((t) => t.rows.length === 0)} empty={<Empty title="Tidak ada data pada periode ini" text="Ubah rentang tanggal." />}>
        {(d) => (
          <div className="stack stack-lg" role="tabpanel" id={`panel-${jenis}`} aria-labelledby={`tab-${jenis}`}>
            {d.catatan && <p className="muted small">{d.catatan}</p>}
            {d.tables.map((t, i) => (
              <section key={t.judul} className="section">
                <div className="section-title">
                  <h2>{t.judul}</h2>
                  <a className="btn btn-sm" href={`/api/laporan/${jenis}${qs({ from, to, format: 'csv', tabel: i })}`}>Ekspor CSV</a>
                </div>
                <div className="card table-wrap">
                  <table className="table">
                    <thead><tr>{t.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                    <tbody>{t.rows.length === 0 ? <tr><td colSpan={t.columns.length} className="muted">Tidak ada data</td></tr> : t.rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} className={typeof c === 'number' ? 'num' : ''}>{c ?? '-'}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </Async>
    </div>
  );
}
