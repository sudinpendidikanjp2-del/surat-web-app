'use client';
import Link from 'next/link';
import { AlertCircleIcon, ClockIcon, FilePlus2Icon, InboxIcon, SendIcon, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { GroupedBars } from '@/components/app/bar-chart';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Page, PageHeader, Panel, Section } from '@/components/app/page';
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
    for (const t of d.tugas_perhatian || []) if (t.terlambat) out.push({ key: `tl${t.id}`, kind: 'Tugas terlambat', tone: 'late', title: t.judul, no: t.no_agenda, meta: `Dikerjakan ${t.pic_nama}. Batas waktu ${fmtDate(t.deadline)}.`, href: `/tugas/${t.id}`, button: 'Lihat' });
    for (const l of d.perlu_disposisi || []) out.push({ key: `d${l.id}`, kind: 'Menunggu disposisi Anda', tone: 'warn', title: l.perihal, no: l.no_agenda, meta: `Dari ${l.asal}. Diterima ${fmtDate(l.tgl_diterima)}. Sifat ${l.sifat.toLowerCase()}.`, href: `/surat-masuk/${l.id}`, button: 'Disposisikan' });
    for (const l of d.perlu_persetujuan || []) out.push({ key: `p${l.id}`, kind: 'Menunggu persetujuan Anda', tone: 'warn', title: l.perihal, no: l.no_agenda, meta: `${l.jenis}, dibuat oleh ${l.pembuat}.`, href: `/surat-keluar/${l.id}`, button: 'Putuskan' });
  }
  if (['tu', 'superadmin'].includes(user.role)) {
    for (const l of d.antrian_tu || []) out.push({ key: `t${l.id}`, kind: 'Belum diteruskan ke pimpinan', tone: 'info', title: l.perihal, no: l.no_agenda, meta: `Dari ${l.asal}. Diterima ${fmtDate(l.tgl_diterima)}.`, href: `/surat-masuk/${l.id}`, button: 'Teruskan', run: () => act.forward(l.id) });
  }
  for (const x of d.disposisi_baru || []) out.push({ key: `db${x.id}`, kind: 'Disposisi baru untuk Anda', tone: 'warn', title: x.perihal, no: x.no_agenda, meta: `Dari ${x.dari}: "${x.instruksi}". Batas waktu ${fmtDate(x.deadline)}.`, href: `/surat-masuk/${x.letter_in_id}`, button: 'Terima', run: () => act.accept(x.id) });
  for (const t of d.tugas_terdekat || []) {
    if (t.sla.level !== 'late' && t.sla.level !== 'warn') continue;
    out.push({ key: `tt${t.id}`, kind: t.sla.level === 'late' ? 'Tugas Anda terlambat' : 'Tugas Anda hampir jatuh tempo', tone: t.sla.level === 'late' ? 'late' : 'warn', title: t.judul, no: t.no_agenda, meta: `${t.sla.label}. Kemajuan ${t.progress}%.`, href: `/tugas/${t.id}`, button: 'Laporkan' });
  }
  return out;
}

const KIND_STYLE = { late: 'text-late', warn: 'text-warn', info: 'text-primary' };

function TodoList({ d }: { d: DashboardData }) {
  const user = useUser();
  const accept = useAction((id: number) => api.post(`/dispositions/${id}/terima`), { success: 'Disposisi diterima. Surat ada di Pekerjaan Saya.', keys: ['dashboard', 'dispositions', 'letter'] });
  const forward = useAction((id: number) => api.post(`/letters-in/${id}/teruskan`), { success: 'Surat diteruskan ke pimpinan.', keys: ['dashboard', 'letters-in'] });
  const items = todos(d, user, { accept: (id) => accept.mutate(id), forward: (id) => forward.mutate(id) });
  const shown = items.slice(0, 12);
  return (
    <Section title="Perlu tindakan Anda" intro={items.length ? 'Paling mendesak di atas.' : undefined}
      action={items.length > 0 ? <span className="text-sm text-muted-foreground">{items.length} pekerjaan</span> : undefined}>
      {shown.length === 0 ? (
        <Empty title="Tidak ada yang menunggu Anda" text="Surat atau tugas baru untuk Anda akan muncul di sini dan di Pemberitahuan." />
      ) : (
        <ol className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-border bg-card shadow-(--shadow-card)">
          {shown.map((it) => (
            <li key={it.key} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className={`flex items-center gap-1.5 text-sm font-semibold ${KIND_STYLE[it.tone]}`}>
                  {it.tone === 'late' ? <AlertCircleIcon className="size-3.5" aria-hidden /> : <ClockIcon className="size-3.5" aria-hidden />}{it.kind}
                </p>
                <Link href={it.href} className="truncate font-semibold text-foreground no-underline hover:underline">{it.title}</Link>
                <p className="truncate text-sm text-muted-foreground">{it.no && <><Stamp>{it.no}</Stamp>{' '}</>}{it.meta}</p>
              </div>
              {it.run ? (
                <Button size="sm" variant="outline" className="shrink-0 self-start sm:self-auto" disabled={accept.isPending || forward.isPending} onClick={it.run}>{it.button}</Button>
              ) : (
                <Button asChild size="sm" variant="outline" className="shrink-0 self-start sm:self-auto"><Link href={it.href}>{it.button}</Link></Button>
              )}
            </li>
          ))}
        </ol>
      )}
      {items.length > shown.length && <p className="text-sm">Ada {items.length - shown.length} lagi. <Link href="/pekerjaan">Lihat semua di Pekerjaan Saya</Link></p>}
    </Section>
  );
}

/** Kartu angka seperti referensi: label kecil, angka besar, ikon dalam lingkaran. Angka dari data kantor sendiri. */
function StatCard({ href, n, label, icon: Icon, tone = 'neutral', note }: { href: string; n?: number; label: string; icon: LucideIcon; tone?: 'neutral' | 'accent' | 'late'; note?: string }) {
  return (
    <Link href={href} className="pressable flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-foreground no-underline shadow-(--shadow-card) hover:border-strong">
      <span className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className={cn('flex size-9 items-center justify-center rounded-full', tone === 'accent' ? 'bg-accent text-accent-foreground' : tone === 'late' && n ? 'bg-late-soft text-late' : 'bg-primary-soft text-primary-ink')}><Icon className="size-[18px]" aria-hidden /></span>
      </span>
      <span className={cn('text-3xl font-bold tabular-nums tracking-tight', tone === 'late' && n ? 'text-late' : '')}>{(n ?? 0).toLocaleString('id-ID')}</span>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </Link>
  );
}

export function HomePage() {
  const user = useUser();
  const q = useDashboard();
  return (
    <Page wide>
      <PageHeader title={`${greeting()}, ${user.nama}`} intro={`${fmtDateLong()}. ${user.roleLabel}${user.unitNama && user.unitNama !== user.roleLabel ? `, ${user.unitNama}` : ''}.`}>
        {can.manageIn(user) && <Button asChild><Link href="/surat-masuk/baru"><InboxIcon aria-hidden /> Catat Surat Masuk</Link></Button>}
        {can.writeOut(user) && <Button asChild variant={can.manageIn(user) ? 'outline' : 'default'}><Link href="/surat-keluar/baru"><FilePlus2Icon aria-hidden /> Buat Surat Keluar</Link></Button>}
      </PageHeader>

      <Async q={q} isEmpty={() => false} loadingLabel="Menyiapkan daftar pekerjaan…">
        {(d) => {
          const proses = (d.counts.menunggu_disposisi || 0) + (d.counts.diproses || 0) + (d.counts.menunggu_konfirmasi || 0);
          return (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard href="/surat-masuk" n={d.counts.masuk_tahun_ini} label="Surat masuk tahun ini" icon={InboxIcon} tone="accent" />
                <StatCard href="/surat-masuk?tampil=proses" n={proses} label="Dalam proses" icon={ClockIcon} />
                <StatCard href="/surat-masuk?tampil=terlambat" n={d.counts.terlambat} label="Melewati batas waktu" icon={AlertCircleIcon} tone="late" />
                <StatCard href="/surat-keluar" n={d.keluar.keluar_tahun_ini} label="Surat keluar tahun ini" icon={SendIcon} />
              </div>
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="flex min-w-0 flex-col gap-6">
                  {d.per_bulan && (
                    <Card>
                      <CardContent className="flex flex-col gap-4">
                        <div className="flex flex-col gap-0.5">
                          <h2 className="text-base font-bold">Surat masuk per bulan</h2>
                          <p className="text-sm text-muted-foreground">Tahun {new Date().getFullYear()}. Arahkan atau fokus ke bulan untuk melihat angkanya.{d.rata_hari_selesai != null ? ` Rata-rata selesai dalam ${d.rata_hari_selesai} hari.` : ''}</p>
                        </div>
                        <GroupedBars label="Grafik surat masuk dan selesai per bulan" data={d.per_bulan.map((m) => ({ name: m.bulan, masuk: m.masuk, selesai: m.selesai }))}
                          series={[{ key: 'masuk', label: 'Diterima', color: 'var(--color-chart-1)' }, { key: 'selesai', label: 'Selesai', color: 'var(--color-chart-2)' }]} />
                      </CardContent>
                    </Card>
                  )}
                  {can.work(user) ? <TodoList d={d} /> : <Section title="Pemantauan"><Empty title="Anda masuk sebagai pemantau" text="Buka Surat Masuk atau Surat Keluar untuk melihat daftar surat." /></Section>}
                </div>
                <aside className="flex flex-col gap-6">
                  {['tu', 'superadmin'].includes(user.role) && (
                    <Section title="Surat keluar">
                      <Panel className="divide-y divide-line">
                        <MiniStat href="/surat-keluar?tampil=menunggu" n={d.keluar.menunggu_persetujuan} label="Menunggu persetujuan" />
                        <MiniStat href="/surat-keluar?tampil=kirim" n={d.keluar.menunggu_ttd} label="Menunggu tanda tangan" />
                        <MiniStat href="/surat-keluar?tampil=kirim" n={d.keluar.menunggu_kirim} label="Siap dikirim" />
                        <p className="flex flex-col gap-0.5 px-5 py-3 text-sm"><span className="text-muted-foreground">Nomor terakhir</span>{d.nomor_terakhir ? <Link href={`/surat-keluar/${d.nomor_terakhir.id}`} className="font-semibold">{d.nomor_terakhir.nomor_surat}</Link> : <span>Belum ada</span>}</p>
                      </Panel>
                    </Section>
                  )}
                  {d.tugas_saya && (
                    <Section title="Tugas saya">
                      <Panel className="divide-y divide-line">
                        <MiniStat href="/pekerjaan?tampil=tugas" n={d.tugas_saya.terbuka} label="Belum selesai" />
                        <MiniStat href="/pekerjaan?tampil=tugas" n={d.tugas_saya.hari_ini} label="Batas waktu hari ini" />
                        <MiniStat href="/pekerjaan?tampil=tugas" n={d.tugas_saya.terlambat} label="Terlambat" late />
                      </Panel>
                    </Section>
                  )}
                </aside>
              </div>
            </>
          );
        }}
      </Async>
    </Page>
  );
}

function MiniStat({ href, n, label, late }: { href: string; n?: number; label: string; late?: boolean }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 px-5 py-3 text-sm text-foreground no-underline hover:bg-muted">
      <span>{label}</span>
      <span className={cn('text-lg font-bold tabular-nums', late && n ? 'text-late' : '')}>{n ?? 0}</span>
    </Link>
  );
}
