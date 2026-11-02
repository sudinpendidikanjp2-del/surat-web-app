import { AlertCircleIcon, CheckCircle2Icon, ClockIcon, MinusCircleIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { STATUS_DISP, STATUS_IN } from '@/domain/letter-in';
import { STATUS_OUT } from '@/domain/letter-out';
import { TASK_STATUS } from '@/domain/task';
import type { SlaIndicator } from '@/domain/sla';
import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'late';

const TONE_IN: Record<string, Tone> = { DITERIMA: 'neutral', MENUNGGU_DISPOSISI: 'warn', DIDISPOSISIKAN: 'accent', SEDANG_DIPROSES: 'accent', MENUNGGU_KONFIRMASI: 'warn', MENUNGGU_PERSETUJUAN: 'warn', SELESAI: 'ok', DIARSIPKAN: 'neutral' };
const TONE_OUT: Record<string, Tone> = { DRAFT: 'neutral', REVIEW: 'warn', REVISI: 'warn', MENUNGGU_PERSETUJUAN: 'warn', DISETUJUI: 'accent', NOMOR_DIBERIKAN: 'accent', DITANDATANGANI: 'accent', DIKIRIM: 'ok', SELESAI: 'ok', DITOLAK: 'late' };
const TONE_TASK: Record<string, Tone> = { BELUM_DIMULAI: 'neutral', DITERIMA: 'neutral', DIPROSES: 'accent', MENUNGGU_DATA: 'warn', MENUNGGU_KONFIRMASI: 'warn', MENUNGGU_PERSETUJUAN: 'warn', SELESAI: 'ok', DIBATALKAN: 'neutral' };
const TONE_DISP: Record<string, Tone> = { BARU: 'warn', DITERIMA: 'accent', DITERUSKAN: 'neutral', DIKEMBALIKAN: 'late', SELESAI: 'ok' };

const make = (labels: Record<string, string>, tones: Record<string, Tone>) => function Status({ status }: { status: string }) {
  return <Badge tone={tones[status] || 'neutral'}>{labels[status] || status}</Badge>;
};
export const StatusIn = make(STATUS_IN, TONE_IN);
export const StatusOut = make(STATUS_OUT, TONE_OUT);
export const StatusTask = make(TASK_STATUS, TONE_TASK);
export const StatusDisp = make(STATUS_DISP, TONE_DISP);

/** Sisa waktu: ikon berbeda bentuk per keadaan, jadi tidak hanya bergantung pada warna. */
export function Deadline({ sla, className }: { sla: SlaIndicator | null | undefined; className?: string }) {
  if (!sla || sla.level === 'none') return <span className={cn('inline-flex items-center gap-1 text-sm text-muted-foreground', className)}><MinusCircleIcon className="size-3.5" aria-hidden />Tanpa batas waktu</span>;
  const map = {
    ok: ['text-ok', ClockIcon], warn: ['text-warn', AlertCircleIcon], late: ['text-late', AlertCircleIcon], selesai: ['text-ok', CheckCircle2Icon], none: ['', MinusCircleIcon],
  } as const;
  const [cls, Icon] = map[sla.level];
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold', cls, className)}><Icon className="size-3.5" aria-hidden />{sla.label}</span>;
}

export const Stamp = ({ children }: { children: React.ReactNode }) => <span className="stamp">{children}</span>;
