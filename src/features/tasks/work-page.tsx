'use client';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FilterButtons } from '@/components/app/list-controls';
import { Page, PageHeader, Section } from '@/components/app/page';
import { Async, Empty } from '@/components/app/states';
import { Deadline, Stamp, StatusDisp, StatusTask } from '@/components/app/status';
import { useAction } from '@/components/app/use-action';
import { useListState } from '@/components/app/use-list-state';
import { useUser } from '@/components/app/user-context';
import { slaIndicator } from '@/domain/sla';
import { api } from '@/lib/api-client';
import { fmtDate } from '@/lib/format';
import { useDispositions, useTasks, type TaskRow } from './api';

type View = 'belum' | 'selesai';

function TaskCard({ t, showPic }: { t: TaskRow; showPic?: boolean }) {
  return (
    <Card><CardContent className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2"><StatusTask status={t.status} /><Deadline sla={t.sla} /></div>
      <Link href={`/tugas/${t.id}`} className="text-xl font-bold text-foreground break-words">{t.judul}</Link>
      <p className="text-muted-foreground"><Stamp>{t.no_agenda}</Stamp> {t.perihal}</p>
      <p>{showPic ? <>Dikerjakan <strong>{t.pic_nama}</strong>. </> : <>Dari <strong>{t.assigner_nama}</strong>. </>}Batas waktu {fmtDate(t.deadline)}. Kemajuan <strong>{t.progress}%</strong>.</p>
      <div><Button asChild variant={showPic ? 'outline' : 'default'} className="no-underline"><Link href={`/tugas/${t.id}`}>{showPic ? 'Lihat Tugas' : 'Buka dan Laporkan Kemajuan'}</Link></Button></div>
    </CardContent></Card>
  );
}

export function WorkPage() {
  const user = useUser();
  const { view, set } = useListState<View>('belum');
  const open = view === 'belum';
  const disp = useDispositions(open ? { scope: 'saya', status: 'BARU,DITERIMA' } : { scope: 'saya', status: 'DITERUSKAN,SELESAI,DIKEMBALIKAN' });
  const mine = useTasks(open ? { scope: 'saya', antrian: 'terbuka' } : { scope: 'saya', status: 'SELESAI,DIBATALKAN' });
  const gives = ['superadmin', 'pimpinan', 'pejabat'].includes(user.role);
  const given = useTasks(open ? { scope: 'diberikan', antrian: 'terbuka' } : { scope: 'diberikan', status: 'SELESAI,DIBATALKAN' });
  const accept = useAction((id: number) => api.post(`/dispositions/${id}/terima`), { success: 'Disposisi sudah Anda terima.', keys: ['dispositions', 'dashboard', 'letter'] });
  return (
    <Page>
      <PageHeader title="Pekerjaan Saya" intro="Disposisi dan tugas yang ditujukan kepada Anda. Yang paling dekat batas waktunya ada di atas." />
      <FilterButtons label="Tampilkan pekerjaan" value={view} onChange={(v) => set({ tampil: v })} options={[{ value: 'belum', label: 'Belum selesai' }, { value: 'selesai', label: 'Sudah selesai' }]} />

      <Section title="Disposisi untuk Anda" intro="Arahan pimpinan untuk Anda atau unit Anda. Terima dulu, lalu kerjakan atau bagikan ke pegawai.">
        <Async q={disp} isEmpty={(d) => d.items.length === 0} empty={<Empty title={open ? 'Tidak ada disposisi yang menunggu Anda' : 'Belum ada disposisi yang selesai'} />}>
          {(d) => (
            <ul className="flex flex-col gap-4">
              {d.items.map((x) => (
                <li key={x.id}><Card><CardContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2"><StatusDisp status={x.status} />{x.deadline && <Deadline sla={slaIndicator(x.deadline, new Date(), !['BARU', 'DITERIMA'].includes(x.status))} />}</div>
                  <Link href={`/surat-masuk/${x.letter_in_id}`} className="text-xl font-bold text-foreground break-words">{x.perihal}</Link>
                  <p className="text-lg">&ldquo;{x.instruksi}&rdquo;</p>
                  <div className="flex flex-wrap gap-2">{x.tindakan.map((t) => <Badge key={t} tone="accent">{t}</Badge>)}</div>
                  <p className="text-muted-foreground"><Stamp>{x.no_agenda}</Stamp> Dari {x.dari}. Harus selesai {fmtDate(x.deadline)}.</p>
                  <div className="flex flex-wrap gap-3">
                    {x.status === 'BARU' && <Button disabled={accept.isPending} onClick={() => accept.mutate(x.id)}>Terima Disposisi</Button>}
                    <Button asChild variant="outline" className="no-underline"><Link href={`/surat-masuk/${x.letter_in_id}`}>Buka Surat</Link></Button>
                  </div>
                </CardContent></Card></li>
              ))}
            </ul>
          )}
        </Async>
      </Section>

      <Section title="Tugas Anda" intro="Pekerjaan yang Anda kerjakan sendiri. Laporkan kemajuannya agar pemberi tugas tahu.">
        <Async q={mine} isEmpty={(d) => d.items.length === 0} empty={<Empty title={open ? 'Tidak ada tugas yang belum selesai' : 'Belum ada tugas yang selesai'} />}>
          {(d) => <ul className="flex flex-col gap-4">{d.items.map((t) => <li key={t.id}><TaskCard t={t} /></li>)}</ul>}
        </Async>
      </Section>

      {gives && (
        <Section title="Tugas yang Anda berikan" intro="Pantau kemajuan pekerjaan yang Anda bagikan ke pegawai.">
          <Async q={given} isEmpty={(d) => d.items.length === 0} empty={<Empty title="Belum ada" />}>
            {(d) => <ul className="flex flex-col gap-4">{d.items.map((t) => <li key={t.id}><TaskCard t={t} showPic /></li>)}</ul>}
          </Async>
        </Section>
      )}
    </Page>
  );
}
