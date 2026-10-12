import { Link } from 'react-router-dom';
import { useUser } from '../auth.jsx';
import { Empty, Stamp, StatusDisp } from '../ui.jsx';
import { ListView } from '../table.jsx';
import { fmtDate } from '../format.js';

const FILTERS = [
  { key: 'status', label: 'Status', type: 'multi', options: [{ value: 'BARU', label: 'Menunggu diterima' }, { value: 'DITERIMA', label: 'Diterima' }, { value: 'DITERUSKAN', label: 'Diteruskan' }, { value: 'DIKEMBALIKAN', label: 'Dikembalikan' }, { value: 'SELESAI', label: 'Selesai' }] },
  { key: 'prioritas', label: 'Prioritas', type: 'multi', options: ['Normal', 'Tinggi', 'Mendesak'] },
];
const EXTRA = ['scope', 'antrian'];
const DEFAULTS = { scope: 'saya', sort: 'dibuat', dir: 'desc' };

export function Dispositions() {
  const user = useUser();
  const seesAll = ['superadmin', 'tu', 'pimpinan', 'pejabat'].includes(user.role);
  const tabs = [
    { label: 'Perlu saya terima', patch: { scope: 'saya', status: 'BARU', antrian: '' } },
    { label: 'Untuk saya', patch: { scope: 'saya', status: '', antrian: '' } },
    { label: 'Terlambat', patch: { scope: 'saya', status: '', antrian: 'terlambat' } },
    ...(seesAll ? [{ label: 'Semua yang terlihat', patch: { scope: 'semua', status: '', antrian: '' } }] : []),
  ];
  const bulk = [{ key: 'terima', label: 'Terima Disposisi', tone: 'primary', url: '/dispositions/bulk/terima' }];
  const columns = [
    { key: 'surat', header: 'Surat', sort: 'agenda', primary: true, title: (r) => r.perihal,
      cell: (d) => (<><Stamp>{d.no_agenda}</Stamp><div className="cell-title cell-gap"><Link to={`/surat-masuk/${d.letter_in_id}`}>{d.perihal}</Link></div><div className="muted small">Dari {d.asal}</div></>) },
    { key: 'instruksi', header: 'Instruksi', cell: (d) => <>{d.instruksi}<div className="muted small">{d.tindakan.join(', ')}</div></> },
    { key: 'dari', header: 'Dari dan kepada', cell: (d) => <>{d.dari}<div className="muted small">kepada {d.kepada}</div></> },
    { key: 'tenggat', header: 'Batas waktu', sort: 'tenggat', cell: (d) => fmtDate(d.deadline) },
    { key: 'status', header: 'Status', sort: 'status', cell: (d) => <StatusDisp status={d.status} /> },
  ];
  return (
    <ListView
      title="Disposisi" sub="Disposisi yang ditujukan kepada Anda dan jejak pelimpahannya."
      queryKey="dispositions" endpoint="/dispositions" idsEndpoint="/dispositions/ids"
      filters={FILTERS} extraKeys={EXTRA} tabs={tabs} columns={columns} rowTo={(d) => `/surat-masuk/${d.letter_in_id}`}
      bulk={user.role === 'viewer' ? [] : bulk} defaults={DEFAULTS} searchPlaceholder="Cari surat atau instruksi"
      labelOf={(id) => `Disposisi #${id}`}
      empty={<Empty title="Tidak ada disposisi" text="Disposisi baru akan muncul di sini dan di notifikasi." />}
    />
  );
}
