import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get } from '../api.js';
import { Async, PageHead } from '../ui.jsx';
import { fmtDate } from '../format.js';
import { TINDAKAN } from '../format.js';

export default function DispositionSheet() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['lembar', id], queryFn: () => get(`/letters-in/${id}/lembar-disposisi`) });
  return (
    <div className="page">
      <div className="no-print"><PageHead title="Lembar disposisi" sub="Cetak atau simpan sebagai PDF dari dialog cetak peramban.">
        <Link className="btn" to={`/surat-masuk/${id}`}>Kembali ke Surat</Link>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>Cetak atau Simpan PDF</button>
      </PageHead></div>
      <Async q={q} isEmpty={() => false} rows={5}>
        {(d) => {
          const l = d.letter;
          const roots = d.dispositions;
          const tindakan = new Set(roots.flatMap((x) => x.tindakan));
          return (
            <article className="print-sheet" aria-label="Lembar disposisi">
              <div style={{ textAlign: 'center', fontWeight: 700, textTransform: 'uppercase' }}>{d.instansi?.nama}</div>
              <h2 style={{ margin: '4px 0 0' }}>DISPOSISI</h2>
              <table>
                <tbody>
                  <tr><th>Nomor agenda</th><td>{l.no_agenda}</td><td rowSpan={4} style={{ width: 150, textAlign: 'center' }}><img src={d.qr} alt={`Kode QR ${l.no_agenda}`} width="120" height="120" /></td></tr>
                  <tr><th>Nomor surat</th><td>{l.no_surat}</td></tr>
                  <tr><th>Tanggal surat</th><td>{fmtDate(l.tgl_surat)}, diterima {fmtDate(l.tgl_diterima)}</td></tr>
                  <tr><th>Dari</th><td>{l.asal}{l.instansi ? `, ${l.instansi}` : ''}</td></tr>
                  <tr><th>Perihal</th><td colSpan={2}>{l.perihal}</td></tr>
                  <tr><th>Sifat dan prioritas</th><td colSpan={2}>{l.sifat}, {l.prioritas}</td></tr>
                  <tr><th>Diteruskan kepada</th><td colSpan={2}>{roots.length === 0 ? '...........................' : roots.map((x) => <div key={x.id}>{x.status === 'DIKEMBALIKAN' ? '☐' : '☑'} {x.kepada}{x.kepada_jabatan ? `, ${x.kepada_jabatan}` : ''}</div>)}</td></tr>
                  <tr><th>Tindakan</th><td colSpan={2}>{TINDAKAN.map((t) => <div key={t}>{tindakan.has(t) ? '☑' : '☐'} {t}</div>)}</td></tr>
                  <tr><th>Instruksi</th><td colSpan={2}>{roots.length === 0 ? <div style={{ minHeight: 60 }} /> : roots.map((x) => <div key={x.id}>{x.instruksi} <em>({x.dari})</em></div>)}</td></tr>
                  <tr><th>Batas waktu</th><td colSpan={2}>{roots.length ? [...new Set(roots.map((x) => fmtDate(x.deadline)))].join(', ') : '...........................'}</td></tr>
                </tbody>
              </table>
            </article>
          );
        }}
      </Async>
    </div>
  );
}
