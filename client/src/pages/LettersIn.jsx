import { Link } from 'react-router-dom';
import { useUser, can } from '../auth.jsx';
import { Empty, Sla, Stamp, StatusIn } from '../ui.jsx';
import { ListView } from '../table.jsx';
import { BulkDisposeSheet } from '../forms.jsx';
import { fmtDate, PRIORITAS, SIFAT, STATUS_IN } from '../format.js';

const FILTERS = [
  { key: 'status', label: 'Status', type: 'multi', options: Object.entries(STATUS_IN).map(([value, [label]]) => ({ value, label })) },
  { key: 'sifat', label: 'Sifat surat', type: 'multi', options: SIFAT },
  { key: 'prioritas', label: 'Prioritas', type: 'multi', options: PRIORITAS },
  { key: 'from', label: 'Diterima dari tanggal', type: 'date' },
  { key: 'to', label: 'Diterima sampai tanggal', type: 'date' },
];
const EXTRA = ['antrian'];
const DEFAULTS = { sort: 'agenda', dir: 'desc' };

export function LettersIn() {
  const user = useUser();
  const isTu = can.kelolaIn(user);
  const isLeader = ['pimpinan', 'superadmin'].includes(user.role);
  const tabs = [
    { label: 'Semua', patch: { status: '', antrian: '' } },
    ...(isTu ? [{ label: 'Belum diteruskan', patch: { status: '', antrian: 'belum_diteruskan' } }] : []),
    { label: 'Menunggu disposisi', patch: { status: 'MENUNGGU_DISPOSISI', antrian: '' } },
    { label: 'Diproses', patch: { status: 'DIDISPOSISIKAN,SEDANG_DIPROSES,MENUNGGU_KONFIRMASI,MENUNGGU_PERSETUJUAN', antrian: '' } },
    { label: 'Terlambat', patch: { status: '', antrian: 'terlambat' } },
    { label: 'Selesai', patch: { status: 'SELESAI,DIARSIPKAN', antrian: '' } },
  ];
  const bulk = [
    ...(isTu ? [
      { key: 'teruskan', label: 'Teruskan kepada Pimpinan', tone: 'primary', url: '/letters-in/bulk/teruskan', confirm: { title: (n) => `Teruskan ${n} surat kepada pimpinan?`, body: (n) => `${n} surat akan berstatus menunggu disposisi dan pimpinan diberi tahu. Surat yang sudah diteruskan dilewati.`, button: 'Teruskan' } },
      { key: 'arsip', label: 'Arsipkan', url: '/letters-in/bulk/arsipkan', confirm: { title: (n) => `Arsipkan ${n} surat?`, body: () => 'Hanya surat berstatus selesai yang dapat diarsipkan. Lainnya dilewati.', button: 'Arsipkan' } },
    ] : []),
    ...(isLeader ? [{ key: 'disposisi', label: 'Berikan Disposisi', tone: 'primary', url: '/letters-in/bulk/disposisi', sheet: BulkDisposeSheet }] : []),
  ];
  const columns = [
    { key: 'surat', header: 'Surat', sort: 'perihal', primary: true, title: (r) => r.perihal,
      cell: (l) => (
        <>
          <div className="row" style={{ gap: 8 }}><Stamp>{l.no_agenda}</Stamp>{l.sifat !== 'Biasa' && <span className="small" style={{ fontWeight: 600 }}>{l.sifat}</span>}{l.prioritas === 'Mendesak' && <span className="small" style={{ fontWeight: 600, color: 'var(--late-ink)' }}>Mendesak</span>}</div>
          <div className="cell-title" style={{ marginTop: 4 }}><Link to={`/surat-masuk/${l.id}`}>{l.perihal}</Link></div>
          <div className="muted small">Dari {l.asal}{l.instansi ? `, ${l.instansi}` : ''} · {l.no_surat} · diterima {fmtDate(l.tgl_diterima)}</div>
        </>
      ) },
    { key: 'posisi', header: 'Posisi saat ini', cell: (l) => l.pic || <span className="muted">{l.status === 'DITERIMA' ? 'Di Tata Usaha' : l.status === 'MENUNGGU_DISPOSISI' ? 'Di pimpinan' : '-'}</span> },
    { key: 'status', header: 'Status', sort: 'status', cell: (l) => <StatusIn status={l.status} /> },
    { key: 'tenggat', header: 'Tenggat', sort: 'tenggat', cell: (l) => <><div>{fmtDate(l.deadline)}</div><Sla sla={l.sla} /></> },
  ];
  return (
    <ListView
      title="Surat masuk" sub="Semua surat yang diterima beserta posisi dan tenggatnya."
      actions={isTu && <Link to="/surat-masuk/baru" className="btn btn-primary">Catat Surat Masuk</Link>}
      queryKey="letters-in" endpoint="/letters-in" idsEndpoint="/letters-in/ids" csv
      filters={FILTERS} extraKeys={EXTRA} tabs={tabs} columns={columns} rowTo={(l) => `/surat-masuk/${l.id}`} bulk={bulk}
      defaults={DEFAULTS} searchPlaceholder="Cari nomor agenda, nomor surat, perihal, pengirim"
      empty={<Empty title="Belum ada surat masuk" text={isTu ? 'Catat surat pertama dengan foto atau isian manual.' : 'Surat yang diterima Tata Usaha akan tampil di sini.'}/>}
    />
  );
}
