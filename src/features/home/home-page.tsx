'use client';
import Link from 'next/link';
import { AlertCircleIcon, ClockIcon, FilePlus2Icon, InboxIcon, SendIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Page, Section } from '@/components/app/page';
import { Async, Empty } from '@/components/app/states';
import { Stamp } from '@/components/app/status';
import { useAction } from '@/components/app/use-action';
import { useUser } from '@/components/app/user-context';
import { can, type PublicUser } from '@/domain/roles';
import { api } from '@/lib/api-client';
import { fmtDate, fmtDateLong, greeting } from '@/lib/format';
import { useDashboard, type DashboardData } from './api';

interface Todo {
  key: string; kind: string; tone: 'late' | 'warn' | 'info'; title: string; no?: string; meta: string;
  href: string; button: string; run?: () => void;
}

/** Daftar pekerjaan yang menunggu pengguna ini, dari yang paling mendesak. Setiap baris tepat satu tombol. */
function todos(d: DashboardData, user: PublicUser, act: { accept: (id: number) => void; forward: (id: number) => void }): Todo[] {
  const out: Todo[] = [];
  const leader = ['pimpinan', 'superadmin'].includes(user.role);
  if (leader) {
    for (const t of d.tugas_perhatian || []) if (t.terlambat) out.push({ key: `tl${t.id}`, kind: 'Tugas terlambat', tone: 'late', title: t.judul, no: t.no_agenda, meta: `Dikerjakan ${t.pic_nama}. Batas waktu ${fmtDate(t.deadline)}.`, href: `/tugas/${t.id}`, button: 'Lihat Tugas' });
    for (const l of d.perlu_disposisi || []) out.push({ key: `d${l.id}`, kind: 'Menunggu disposisi Anda', tone: 'warn', title: l.perihal, no: l.no_agenda, meta: `Dari ${l.asal}. Diterima ${fmtDate(l.tgl_diterima)}. Sifat ${l.sifat.toLowerCase()}.`, href: `/surat-masuk/${l.id}`, button: 'Buka dan Beri Disposisi' });
    for (const l of d.perlu_persetujuan || []) out.push({ key: `p${l.id}`, kind: 'Surat keluar menunggu persetujuan Anda', tone: 'warn', title: l.perihal, no: l.no_agenda, meta: `${l.jenis}, dibuat oleh ${l.pembuat}.`, href: `/surat-keluar/${l.id}`, button: 'Buka dan Putuskan' });
  }
  if (['tu', 'superadmin'].includes(user.role)) {
    for (const l of d.antrian_tu || []) out.push({ key: `t${l.id}`, kind: 'Belum diteruskan ke pimpinan', tone: 'info', title: l.perihal, no: l.no_agenda, meta: `Dari ${l.asal}. Diterima ${fmtDate(l.tgl_diterima)}.`, href: `/surat-masuk/${l.id}`, button: 'Teruskan ke Pimpinan', run: () => act.forward(l.id) });
  }
  for (const x of d.disposisi_baru || []) out.push({ key: `db${x.id}`, kind: 'Disposisi baru untuk Anda', tone: 'warn', title: x.perihal, no: x.no_agenda, meta: `Dari ${x.dari}: "${x.instruksi}". Batas waktu ${fmtDate(x.deadline)}.`, href: `/surat-masuk/${x.letter_in_id}`, button: 'Terima Disposisi', run: () => act.accept(x.id) });
  for (const t of d.tugas_terdekat || []) {
    if (t.sla.level !== 'late' && t.sla.level !== 'warn') continue;
    out.push({ key: `tt${t.id}`, kind: t.sla.level === 'late' ? 'Tugas Anda terlambat' : 'Tugas Anda hampir jatuh tempo', tone: t.sla.level === 'late' ? 'late' : 'warn', title: t.judul, no: t.no_agenda, meta: `${t.sla.label}. Kemajuan ${t.progress}%.`, href: `/tugas/${t.id}`, button: 'Laporkan Kemajuan' });
  }
  return out;
}

const KIND_STYLE = { late: 'text-late', warn: 'text-warn', info: 'text-primary' };

function TodoList({ d }: { d: DashboardData }) {
  const user = useUser();
  const accept = useAction((id: number) => api.post(`/dispositions/${id}/terima`), { success: 'Disposisi sudah Anda terima. Surat ada di Pekerjaan Saya.', keys: ['dashboard', 'dispositions', 'letter'] });
  const forward = useAction((id: number) => api.post(`/letters-in/${id}/teruskan`), { success: 'Surat sudah diteruskan ke pimpinan.', keys: ['dashboard', 'letters-in'] });
  const items = todos(d, user, { accept: (id) => accept.mutate(id), forward: (id) => forward.mutate(id) });
  const shown = items.slice(0, 10);
  return (
    <Section title={`Yang perlu Anda kerjakan${items.length ? ` (${items.length})` : ''}`} intro={items.length ? 'Paling mendesak di atas. Tekan tombol hijau untuk mengerjakannya.' : undefined}>
      {shown.length === 0 ? (
        <Empty title="Tidak ada pekerjaan yang menunggu Anda" text="Bila ada surat atau tugas baru untuk Anda, akan muncul di sini dan di Pemberitahuan." />
      ) : (
        <ol className="flex flex-col gap-4">
          {shown.map((it) => (
            <li key={it.key}>
              <Card>
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className={`flex items-center gap-2 font-bold ${KIND_STYLE[it.tone]}`}>
                      {it.tone === 'late' ? <AlertCircleIcon className="size-5" aria-hidden /> : <ClockIcon className="size-5" aria-hidden />}{it.kind}
                    </p>
                    <Link href={it.href} className="text-xl font-bold text-foreground break-words">{it.title}</Link>
                    <p className="text-muted-foreground">{it.no && <><Stamp>{it.no}</Stamp>{' '}</>}{it.meta}</p>
                  </div>
                  {it.run ? (
                    <Button className="shrink-0" disabled={accept.isPending || forward.isPending} onClick={it.run}>{it.button}</Button>
                  ) : (
                    <Button asChild className="shrink-0 no-underline"><Link href={it.href}>{it.button}</Link></Button>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}
      {items.length > shown.length && <p>Ada {items.length - shown.length} pekerjaan lain. <Link href="/pekerjaan">Lihat semua di Pekerjaan Saya</Link></p>}
    </Section>
  );
}

function StatCard({ href, n, label, late }: { href: string; n?: number; label: string; late?: boolean }) {
  return (
    <Link href={href} className="flex flex-col gap-1 rounded-lg border-2 border-[#d6d1c4] bg-card p-5 no-underline hover:border-primary">
      <span className={`text-4xl font-bold tabular-nums ${late && n ? 'text-late' : 'text-foreground'}`}>{n ?? 0}</span>
      <span className="text-lg font-semibold text-foreground underline underline-offset-4">{label}</span>
    </Link>
  );
}

export function HomePage() {
  const user = useUser();
  const q = useDashboard();
  return (
    <Page>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl sm:text-3xl">{greeting()}, {user.nama}</h1>
        <p className="text-lg text-muted-foreground">{fmtDateLong()}. Anda masuk sebagai {user.roleLabel}{user.unitNama && user.unitNama !== user.roleLabel ? `, ${user.unitNama}` : ''}.</p>
      </header>

      <Async q={q} isEmpty={() => false} loadingLabel="Sedang menyiapkan daftar pekerjaan Anda…">
        {(d) => (
          <>
            {can.work(user) && <TodoList d={d} />}

            {(can.manageIn(user) || can.writeOut(user)) && (
              <Section title="Mulai pekerjaan baru">
                <div className="flex flex-col gap-3 sm:flex-row">
                  {can.manageIn(user) && <Button asChild size="lg" className="no-underline"><Link href="/surat-masuk/baru"><InboxIcon aria-hidden /> Catat Surat Masuk</Link></Button>}
                  {can.writeOut(user) && <Button asChild size="lg" variant="outline" className="no-underline"><Link href="/surat-keluar/baru"><FilePlus2Icon aria-hidden /> Buat Surat Keluar</Link></Button>}
                </div>
              </Section>
            )}

            <Section title="Ringkasan surat masuk" intro="Tekan salah satu angka untuk melihat daftarnya.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard href="/surat-masuk" n={d.counts.masuk_tahun_ini} label="Surat masuk tahun ini" />
                <StatCard href="/surat-masuk?tampil=proses" n={(d.counts.menunggu_disposisi || 0) + (d.counts.diproses || 0) + (d.counts.menunggu_konfirmasi || 0)} label="Masih dikerjakan" />
                <StatCard href="/surat-masuk?tampil=terlambat" n={d.counts.terlambat} label="Melewati batas waktu" late />
              </div>
            </Section>

            {['tu', 'superadmin'].includes(user.role) && (
              <Section title="Surat keluar">
                <Card><CardContent className="flex flex-col gap-2">
                  <p><SendIcon className="mr-2 inline size-5" aria-hidden />{d.keluar.menunggu_ttd || 0} surat menunggu tanda tangan, {d.keluar.menunggu_kirim || 0} surat siap dikirim.</p>
                  <p>Nomor surat terakhir: {d.nomor_terakhir ? <Link href={`/surat-keluar/${d.nomor_terakhir.id}`} className="font-bold">{d.nomor_terakhir.nomor_surat}</Link> : 'belum ada'}.</p>
                </CardContent></Card>
              </Section>
            )}
          </>
        )}
      </Async>
    </Page>
  );
}
