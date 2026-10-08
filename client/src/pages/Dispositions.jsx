import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, post, qs } from '../api.js';
import { useUser } from '../auth.jsx';
import { Async, Empty, PageHead, Stamp, StatusDisp, useAction } from '../ui.jsx';
import { fmtDate } from '../format.js';

export function Dispositions() {
  const user = useUser();
  const [scope, setScope] = useState('saya');
  const q = useQuery({ queryKey: ['dispositions', scope], queryFn: () => get(`/dispositions${qs({ scope })}`) });
  const accept = useAction((id) => post(`/dispositions/${id}/terima`), { success: 'Disposisi diterima', keys: ['dispositions', 'dashboard', 'letter'] });
  const seesAll = ['superadmin', 'tu', 'pimpinan', 'pejabat'].includes(user.role);
  return (
    <div className="page">
      <PageHead title="Disposisi" sub="Disposisi yang ditujukan kepada Anda dan jejak pelimpahannya." />
      {seesAll && (
        <div className="chips" role="group" aria-label="Cakupan">
          <button type="button" className="chip" aria-pressed={scope === 'saya'} onClick={() => setScope('saya')}>Untuk saya</button>
          <button type="button" className="chip" aria-pressed={scope === 'semua'} onClick={() => setScope('semua')}>Semua yang terlihat</button>
        </div>
      )}
      <div className="card">
        <Async q={q} empty={<Empty title={scope === 'saya' ? 'Tidak ada disposisi untuk Anda' : 'Belum ada disposisi'} text="Disposisi baru akan muncul di sini dan di notifikasi." />}>
          {(rows) => (
            <div className="table-wrap">
              <table className="table stackable">
                <thead><tr><th>Surat</th><th>Instruksi</th><th>Dari</th><th>Kepada</th><th>Batas waktu</th><th>Status</th><th><span className="sr-only">Tindakan</span></th></tr></thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.id}>
                      <td className="primary"><Stamp>{d.no_agenda}</Stamp><div className="cell-title"><Link to={`/surat-masuk/${d.letter_in_id}`}>{d.perihal}</Link></div></td>
                      <td data-label="Instruksi">{d.instruksi}<div className="muted small">{d.tindakan.join(', ')}</div></td>
                      <td data-label="Dari">{d.dari}</td>
                      <td data-label="Kepada">{d.kepada}</td>
                      <td data-label="Batas waktu">{fmtDate(d.deadline)}</td>
                      <td data-label="Status"><StatusDisp status={d.status} /></td>
                      <td>{d.status === 'BARU' && scope === 'saya' && <button type="button" className="btn btn-sm btn-primary" disabled={accept.isPending} onClick={() => accept.mutate(d.id)}>Terima Disposisi</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </div>
    </div>
  );
}
