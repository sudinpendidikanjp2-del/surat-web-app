import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, post } from '../api.js';
import { Async, Empty, PageHead, useAction } from '../ui.jsx';
import { fmtDateTime } from '../format.js';

export default function Notifications() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['notif-count'], queryFn: () => get('/notifications'), refetchInterval: 30000 });
  const readAll = useAction(() => post('/notifications/read', { all: true }), { keys: ['notif-count'], success: 'Semua notifikasi ditandai dibaca' });
  const open = async (n) => {
    if (!n.dibaca) await post('/notifications/read', { ids: [n.id] }).catch(() => {});
    if (n.link) nav(n.link);
  };
  return (
    <div className="page">
      <PageHead title="Notifikasi" sub="Disposisi, tugas, pengingat tenggat, persetujuan, dan sebutan.">
        <button type="button" className="btn" disabled={!q.data?.unread || readAll.isPending} onClick={() => readAll.mutate()}>Tandai Semua Dibaca</button>
      </PageHead>
      <div className="card">
        <Async q={q} isEmpty={(d) => d.items.length === 0} empty={<Empty title="Belum ada notifikasi" text="Disposisi baru dan pengingat tenggat akan muncul di sini." />}>
          {(d) => (
            <ul className="file-list" style={{ padding: '0 20px' }}>
              {d.items.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => open(n)} style={{ all: 'unset', cursor: 'pointer', display: 'block', flex: 1, minHeight: 44 }}>
                    <span className="file-name" style={{ fontWeight: n.dibaca ? 450 : 650 }}>{!n.dibaca && <span className="sr-only">Belum dibaca. </span>}{n.judul}</span>
                    {n.isi && <span className="muted small" style={{ display: 'block' }}>{n.isi}</span>}
                    <span className="muted small">{fmtDateTime(n.created_at)}</span>
                  </button>
                  {!n.dibaca && <span className="nav-count" aria-hidden="true">baru</span>}
                </li>
              ))}
            </ul>
          )}
        </Async>
      </div>
    </div>
  );
}
