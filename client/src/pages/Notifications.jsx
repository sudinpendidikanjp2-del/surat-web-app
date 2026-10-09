import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { post } from '../api.js';
import { Empty, Tag } from '../ui.jsx';
import { ListView } from '../table.jsx';
import { fmtDateTime } from '../format.js';

const FILTERS = [{ key: 'belum', label: 'Tampilkan', type: 'select', options: [{ value: '1', label: 'Hanya yang belum dibaca' }] }];

export default function Notifications() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const open = async (n) => {
    if (!n.dibaca) { await post('/notifications/read', { ids: [n.id] }).catch(() => {}); qc.invalidateQueries({ queryKey: ['notif-count'] }); }
    if (n.link) nav(n.link);
  };
  const columns = [
    { key: 'judul', header: 'Notifikasi', primary: true, title: (n) => n.judul, cell: (n) => (<><span className="cell-title" style={{ fontWeight: n.dibaca ? 450 : 650 }}>{!n.dibaca && <span className="sr-only">Belum dibaca. </span>}{n.judul}</span>{n.isi && <div className="muted small">{n.isi}</div>}</>) },
    { key: 'waktu', header: 'Waktu', className: 'num', cell: (n) => fmtDateTime(n.created_at) },
    { key: 'status', header: 'Status', cell: (n) => (n.dibaca ? <span className="muted small">Dibaca</span> : <Tag tone="accent">Baru</Tag>) },
  ];
  const tabs = [{ label: 'Semua', patch: { belum: '' } }, { label: 'Belum dibaca', patch: { belum: '1' } }];
  return (
    <ListView
      title="Notifikasi" sub="Disposisi, tugas, pengingat tenggat, persetujuan, dan sebutan."
      actions={<button type="button" className="btn" onClick={async () => { await post('/notifications/read', { all: true }); qc.invalidateQueries({ queryKey: ['notif-count'] }); qc.invalidateQueries({ queryKey: ['notifications'] }); }}>Tandai Semua Dibaca</button>}
      queryKey="notifications" endpoint="/notifications" filters={FILTERS} tabs={tabs} columns={columns} onOpen={open}
      bulk={[{ key: 'baca', label: 'Tandai Dibaca', tone: 'primary', url: '/notifications/bulk/dibaca' }]}
      defaults={{}} searchPlaceholder="" labelOf={(id) => `Notifikasi #${id}`}
      empty={<Empty title="Belum ada notifikasi" text="Disposisi baru dan pengingat tenggat akan muncul di sini." />}
    />
  );
}
