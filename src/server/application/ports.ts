/**
 * Port: kontrak yang dibutuhkan use case dari dunia luar (database, file, OCR, dokumen).
 * Implementasinya ada di src/server/infrastructure dan dirangkai di src/server/container.ts.
 * Arah ketergantungan: infrastructure -> application -> domain, tidak pernah sebaliknya.
 */
import type { Instansi, RefItem, RefKategori } from '@/domain/reference';
import type { Actor, Role } from '@/domain/roles';
import type { Disposition, KategoriDokumen, LetterIn, StageCounts, StatusIn } from '@/domain/letter-in';
import type { LetterOut, StatusOut, TemplateField } from '@/domain/letter-out';
import type { ChecklistItem, Task, TaskStatus } from '@/domain/task';
import type { TrackingFacts } from '@/domain/tracking';

export type Row = Record<string, unknown> & { id: number };
export interface Page<T = Row> { items: T[]; total: number; page: number; pageSize: number }
export interface IdList { ids: number[]; total: number; terpotong: boolean }
/** Parameter kueri mentah untuk halaman dan urutan (page, pageSize, sort, dir). */
export type PageQuery = Record<string, string | undefined>;
export interface Visible { id: number; role: Role; unit_id: number | null }

/** File yang diterima dari formulir unggah. */
export interface IncomingFile { name: string; type: string; buffer: Buffer }

/* ======================= Unit of work ======================= */

export interface UnitOfWork {
  /** Jalankan fn dalam satu transaksi; semua repos di dalamnya memakai koneksi yang sama. */
  run<T>(fn: (r: Repos) => Promise<T>): Promise<T>;
  /** Repos tanpa transaksi, untuk bacaan. */
  read: Repos;
}

export interface Repos {
  users: UsersRepo;
  sessions: SessionsRepo;
  units: UnitsRepo;
  settings: SettingsRepo;
  journal: JournalRepo;
  lettersIn: LettersInRepo;
  dispositions: DispositionsRepo;
  tasks: TasksRepo;
  confirmations: ConfirmationsRepo;
  attachments: AttachmentsRepo;
  lettersOut: LettersOutRepo;
  templates: TemplatesRepo;
  refs: RefsRepo;
  instansi: InstansiRepo;
  lettersInQueries: ListQueries<LetterInFilter, LetterInListRow>;
  dispositionQueries: Omit<ListQueries<DispositionFilter>, 'exportRows'>;
  taskQueries: ListQueries<TaskFilter, TaskListRow>;
  letterOutQueries: ListQueries<LetterOutFilter, LetterOutListRow>;
  insightQueries: InsightQueries;
  reportQueries: ReportQueries;
}

/* ======================= Repositori tulis ======================= */

export interface RefsRepo {
  list(kategori: RefKategori, onlyActive: boolean): Promise<RefItem[]>;
  count(kategori: RefKategori): Promise<number>;
  find(id: number): Promise<RefItem | null>;
  exists(kategori: RefKategori, nilai: string, exceptId?: number): Promise<boolean>;
  /** Nilai aktif yang sama (tanpa membedakan huruf besar), dengan ejaan resmi dari tabel. */
  canonical(kategori: RefKategori, nilai: string): Promise<string | null>;
  insert(v: { kategori: RefKategori; nilai: string; keterangan: string | null; urutan: number }): Promise<number>;
  update(id: number, v: { nilai: string; keterangan: string | null; urutan: number; aktif: boolean }): Promise<boolean>;
  setActive(id: number, aktif: boolean): Promise<boolean>;
}

export interface InstansiFilter { q?: string; aktif: boolean | null }
export interface InstansiRepo {
  list(f: InstansiFilter, q: Record<string, string | undefined>): Promise<{ items: Instansi[]; total: number; page: number; pageSize: number }>;
  all(f: InstansiFilter): Promise<Instansi[]>;
  options(): Promise<Pick<Instansi, 'id' | 'nama' | 'singkatan' | 'alamat'>[]>;
  find(id: number): Promise<Instansi | null>;
  idByName(nama: string): Promise<number | null>;
  insert(v: Omit<Instansi, 'id' | 'aktif' | 'jumlah_surat'>): Promise<number>;
  update(id: number, v: Omit<Instansi, 'id' | 'jumlah_surat'>): Promise<boolean>;
  setActive(id: number, aktif: boolean): Promise<boolean>;
}

export interface LoginUser extends Actor { aktif: boolean; password_hash: string }
export interface NewUser { username: string; nama: string; nip: string | null; pangkat: string | null; jabatan: string | null; email: string | null; role: Role; unit_id: number | null; password_hash: string }
export interface UserChanges { nama: string; nip: string | null; pangkat: string | null; jabatan: string | null; email: string | null; role: Role; unit_id: number | null; aktif: boolean }
export interface UserFilter { roles: string[]; unit: number | null; aktif: boolean | null; q?: string }

export interface UsersRepo {
  findForLogin(username: string): Promise<LoginUser | null>;
  passwordHash(id: number): Promise<string | null>;
  setPasswordHash(id: number, hash: string): Promise<void>;
  name(id: number): Promise<string | null>;
  signer(id: number): Promise<{ nama: string; jabatan: string | null; nip: string | null; pangkat: string | null } | null>;
  isActive(id: number): Promise<boolean>;
  isSigner(id: number): Promise<boolean>;
  activeIdsByRole(roles: Role[]): Promise<number[]>;
  /** Pejabat aktif dalam unit; bila tidak ada, semua anggota aktif unit. */
  unitRecipients(unitId: number): Promise<number[]>;
  byUsernames(names: string[]): Promise<Visible[]>;
  options(): Promise<Row[]>;
  list(f: UserFilter, page: PageQuery): Promise<Page>;
  ids(f: UserFilter): Promise<IdList>;
  usernameExists(username: string): Promise<boolean>;
  insert(u: NewUser): Promise<number>;
  update(id: number, u: UserChanges): Promise<boolean>;
  setActive(id: number, aktif: boolean): Promise<boolean>;
  count(): Promise<number>;
  idByUsername(username: string): Promise<number | null>;
}

export interface SessionsRepo {
  create(tokenHash: string, userId: number, hours: number): Promise<void>;
  findActor(tokenHash: string): Promise<Actor | null>;
  delete(tokenHash: string): Promise<void>;
  deleteOthers(userId: number, keepTokenHash: string): Promise<void>;
  deleteForUser(userId: number): Promise<void>;
  deleteExpired(): Promise<void>;
}

export interface UnitsRepo {
  list(): Promise<Row[]>;
  isActive(id: number): Promise<boolean>;
  name(id: number): Promise<string>;
  codeExists(kode: string): Promise<boolean>;
  insert(nama: string, kode: string): Promise<number>;
  update(id: number, nama: string, aktif: boolean): Promise<boolean>;
  ensure(kode: string, nama: string): Promise<void>;
  idByCode(kode: string): Promise<number | null>;
}

export interface SettingsRepo {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  ensure(key: string, value: unknown): Promise<void>;
  all(): Promise<Record<string, unknown>>;
}

export interface AuditEntry { userId: number | null; ip: string; aksi: string; entitas: string; entitasId: number | string | null; detail: Record<string, unknown> }
export interface EventEntry { letterInId?: number | null; letterOutId?: number | null; userId: number | null; tipe: string; teks: string; meta?: Record<string, unknown> }
export interface Notice { tipe: string; judul: string; isi?: string | null; link?: string | null; dedupe?: string | null }

export interface JournalRepo {
  audit(e: AuditEntry): Promise<void>;
  /** Riwayat (timeline). Tidak ada jalur ubah atau hapus. */
  event(e: EventEntry): Promise<void>;
  notify(userIds: number[], n: Notice, exceptUserId?: number | null): Promise<void>;
  /** Nomor urut atomik per kunci, aman untuk permintaan bersamaan. */
  nextSeq(key: string): Promise<number>;
  auditPage(f: { limit: number; offset: number; aksi: string | null; user: number | null; q: string | null }): Promise<{ items: Row[]; total: number }>;
  notifications(userId: number, f: { page: number; pageSize: number; unreadOnly: boolean }): Promise<Page & { unread: number }>;
  markRead(userId: number, ids: number[] | 'all'): Promise<void>;
}

export interface NewLetterIn {
  no_agenda: string; case_no: string; no_surat: string; tgl_surat: string; tgl_diterima: string; asal: string; instansi: string | null;
  alamat: string | null; perihal: string; jenis: string; sifat: string; prioritas: string; lampiran: string | null; catatan: string | null;
  sla_due: string; qr_token: string; created_by: number; track_code: string; track_enabled: boolean;
}
export interface LetterInMeta {
  no_surat: string; tgl_surat: string; asal: string; instansi: string | null; alamat: string | null; perihal: string;
  sifat: string; prioritas: string; lampiran: string | null; catatan: string | null; sla_due: string;
}

export interface LettersInRepo {
  findVisible(actor: Actor, id: number): Promise<LetterIn | null>;
  exists(id: number): Promise<boolean>;
  isVisibleTo(user: Visible, id: number): Promise<boolean>;
  insert(l: NewLetterIn): Promise<{ id: number; no_agenda: string; case_no: string }>;
  updateMeta(id: number, m: LetterInMeta): Promise<void>;
  lockStatus(id: number): Promise<StatusIn | null>;
  setStatus(id: number, status: StatusIn): Promise<void>;
  statusFacts(id: number): Promise<{ dispositions: { status: string; accepted_at: string | null }[]; tasks: { status: string }[]; outs: { status: string }[] }>;
  stageCounts(id: number): Promise<StageCounts>;
  completionFacts(id: number): Promise<{ tasks: { status: string }[]; outs: { no_agenda: string; status: string }[]; confirmations: number }>;
  markForwarded(id: number): Promise<void>;
  /** Catat waktu diteruskan bila belum, dan ubah status awal menjadi DIDISPOSISIKAN. */
  markDisposed(id: number, currentStatus: StatusIn): Promise<void>;
  finish(id: number): Promise<void>;
  archive(id: number): Promise<void>;
  setTracking(id: number, code: string, enabled: boolean): Promise<void>;
  participants(id: number): Promise<number[]>;
  timeline(id: number): Promise<Row[]>;
  summary(id: number): Promise<Row | null>;
  idByQrToken(token: string): Promise<number | null>;
  trackingFacts(code: string): Promise<(TrackingFacts & { track_enabled: boolean }) | null>;
}

export interface DispositionRow extends Disposition { dari_nama: string; ke_nama: string | null; ke_unit: string | null; [k: string]: unknown }
export interface NewDisposition { letterInId: number; parentId: number | null; fromUserId: number; toUserId: number | null; toUnitId: number | null; tindakan: string[]; instruksi: string; deadline: string; prioritas: string }

export interface DispositionsRepo {
  forLetter(letterId: number): Promise<DispositionRow[]>;
  rawForLetter(letterId: number): Promise<Disposition[]>;
  lock(id: number): Promise<Disposition | null>;
  lockInLetter(id: number, letterId: number): Promise<Disposition | null>;
  insert(d: NewDisposition): Promise<number>;
  accept(id: number, userId: number): Promise<void>;
  acceptHeldBy(letterId: number, userId: number): Promise<void>;
  giveBack(id: number, alasan: string): Promise<void>;
  revive(id: number): Promise<void>;
  markForwarded(id: number): Promise<void>;
  finishForLetter(letterId: number): Promise<void>;
  openTaskCount(id: number): Promise<number>;
  sheetRows(letterId: number): Promise<Row[]>;
}

export interface TaskRow extends Task { pic_nama: string; assigner_nama: string; no_agenda: string; perihal: string; [k: string]: unknown }
export interface NewTask { letterInId: number; dispositionId: number | null; judul: string; deskripsi: string | null; picUserId: number; assignerId: number; startDate: string; deadline: string; prioritas: string; checklist: ChecklistItem[] }

export interface TasksRepo {
  find(id: number): Promise<TaskRow | null>;
  forLetter(letterId: number): Promise<TaskRow[]>;
  updates(id: number): Promise<Row[]>;
  insert(t: NewTask): Promise<number>;
  update(id: number, t: { judul: string; deskripsi: string | null; deadline: string; prioritas: string; picUserId: number }): Promise<void>;
  setProgress(id: number, status: TaskStatus, progress: number, checklist: ChecklistItem[] | null): Promise<void>;
  addUpdate(u: { taskId: number; userId: number; progress: number; status: TaskStatus; catatan: string | null }): Promise<void>;
  setDeadline(id: number, deadline: string): Promise<void>;
  hasPic(letterId: number, userId: number): Promise<boolean>;
  dueSoon(): Promise<{ id: number; judul: string; deadline: string; pic_user_id: number; assigner_id: number; no_agenda: string }[]>;
}

export interface ConfirmationsRepo {
  forLetter(letterId: number): Promise<Row[]>;
  insert(c: { letterInId: number; tanggal: string; metode: string; pihak: string; hasil: string; catatan: string | null; buktiAttachmentId: number | null; userId: number }): Promise<number>;
}

export interface AttachmentRecord { id: number; nama: string; kategori: string; versi: number; ukuran: number; mime: string; created_at: string }
export interface AttachmentsRepo {
  find(id: number): Promise<{ id: number; nama: string; mime: string; path: string; letter_in_id: number | null; letter_out_id: number | null } | null>;
  lastVersion(groupKey: string, letterInId: number | null, letterOutId: number | null): Promise<number>;
  insert(a: { letterInId: number | null; letterOutId: number | null; taskId: number | null; kategori: KategoriDokumen; nama: string; mime: string; ukuran: number; path: string; versi: number; groupKey: string; uploaderId: number }): Promise<AttachmentRecord>;
  forLetterIn(letterId: number): Promise<Row[]>;
  forLetterOut(letterId: number): Promise<Row[]>;
  forTask(taskId: number): Promise<Row[]>;
  /** Lampiran yang belum diunggah ke Google Drive, dengan surat pemiliknya untuk menyusun folder. */
  pendingDrive(limit: number): Promise<DrivePending[]>;
  setDrive(id: number, driveFileId: string): Promise<void>;
  driveCounts(): Promise<{ total: number; tersinkron: number }>;
  /** Lupakan status unggahan (folder Drive diganti): semua file diunggah lagi ke folder baru. */
  resetDrive(): Promise<void>;
}
export interface DrivePending { id: number; nama: string; mime: string; path: string; versi: number; arah: 'masuk' | 'keluar'; no_agenda: string; perihal: string; tanggal: string }

export interface NewLetterOut { no_agenda: string; letterInId: number | null; templateVersionId: number; jenis: string; perihal: string; tujuan: string; fields: Record<string, string>; tglSurat: string; signerId: number | null; createdBy: number }

export interface LettersOutRepo {
  findVisible(actor: Actor, id: number): Promise<LetterOut | null>;
  exists(id: number): Promise<boolean>;
  isVisibleTo(user: Visible, id: number): Promise<boolean>;
  lock(id: number): Promise<LetterOut | null>;
  insert(l: NewLetterOut): Promise<LetterOut>;
  updateContent(id: number, l: Pick<LetterOut, 'perihal' | 'tujuan' | 'tgl_surat' | 'penandatangan_id' | 'fields'>): Promise<void>;
  setDocVersion(id: number, versi: number): Promise<void>;
  setStatus(id: number, status: StatusOut): Promise<void>;
  setNomor(id: number, nomor: string): Promise<void>;
  markSent(id: number, metode: string): Promise<void>;
  addApproval(id: number, userId: number, aksi: string, catatan: string | null): Promise<void>;
  approvals(id: number): Promise<Row[]>;
  forLetterIn(letterInId: number): Promise<Row[]>;
  timeline(id: number): Promise<Row[]>;
}

export interface TemplateVersion { id: number; template_id: number; versi: number; file_path: string; fields: TemplateField[]; aktif: boolean }
export interface TemplatesRepo {
  list(onlyActive: boolean): Promise<(Row & { versi_aktif_id: number | null })[]>;
  find(id: number): Promise<(Row & { aktif: boolean }) | null>;
  versions(id: number, onlyActive: boolean): Promise<(Row & { fields: TemplateField[] })[]>;
  version(id: number): Promise<TemplateVersion | null>;
  versionWithTemplate(id: number): Promise<(TemplateVersion & { jenis: string; template_aktif: boolean; template_nama: string }) | null>;
  versionOf(templateId: number, versionId: number): Promise<(TemplateVersion & { kode: string }) | null>;
  classificationCode(versionId: number): Promise<string | null>;
  codeExists(kode: string): Promise<boolean>;
  insert(t: { nama: string; kode: string; jenis: string; deskripsi: string | null; kodeKlasifikasi: string | null; userId: number | null }): Promise<number>;
  update(id: number, t: { nama: string; jenis: string; deskripsi: string | null; kodeKlasifikasi: string | null; aktif: boolean }): Promise<boolean>;
  addVersion(v: { templateId: number; catatan: string | null; path: string; fields: TemplateField[]; activate: boolean; userId: number | null }): Promise<{ id: number; versi: number }>;
  /** Aktifkan satu versi dan nonaktifkan lainnya. Mengembalikan nomor versi, atau null bila tidak ada. */
  activate(templateId: number, versionId: number): Promise<number | null>;
  setFields(versionId: number, fields: TemplateField[]): Promise<void>;
}

/* ======================= Kueri baca (read model) ======================= */

export interface LetterInFilter { status?: string; sifat?: string; prioritas?: string; q?: string; from: string | null; to: string | null; unit: number | null; pic: number | null; antrian?: string }
export interface DispositionFilter { scope: 'saya' | 'semua'; status?: string; prioritas?: string; q?: string; antrian?: string }
export interface TaskFilter { scope: 'saya' | 'diberikan' | 'semua'; status?: string; prioritas?: string; q?: string; antrian?: string; pic: number | null; from: string | null; to: string | null }
export interface LetterOutFilter { status?: string; mine: boolean; jenis?: string; antrian?: string; q?: string; from: string | null; to: string | null }

export type LetterInListRow = Row & { no_agenda: string; no_surat: string; tgl_surat: string; tgl_diterima: string; asal: string; instansi: string | null; perihal: string; sifat: string; prioritas: string; status: StatusIn; sla_due: string | null; deadlines: (string | null)[] | null; pic: string | null };
export type TaskListRow = Row & { status: TaskStatus; deadline: string | null; no_agenda: string; judul: string; pic_nama: string; assigner_nama: string; prioritas: string; progress: number };
export type LetterOutListRow = Row & { status: StatusOut; no_agenda: string; nomor_surat: string | null; tgl_surat: string; jenis: string; tujuan: string; perihal: string; pembuat: string };

export interface ListQueries<F, T extends Row = Row> {
  list(actor: Actor, f: F, page: PageQuery): Promise<Page<T>>;
  ids(actor: Actor, f: F): Promise<IdList>;
  exportRows(actor: Actor, f: F, page: PageQuery): Promise<T[]>;
}

export interface SearchFilter { q: string; from: string | null; to: string | null; status: string | null; sifat: string | null; prioritas: string | null; unit: number | null; pic: number | null; tahun: number | null }

export interface InsightQueries {
  countsIn(actor: Actor, year: number): Promise<Record<string, number>>;
  countsOut(actor: Actor, year: number): Promise<Record<string, number>>;
  awaitingDisposition(): Promise<Row[]>;
  tasksNeedingAttention(): Promise<Row[]>;
  awaitingApproval(): Promise<Row[]>;
  monthly(year: number): Promise<{ masuk: Record<number, number>; selesai: Record<number, number> }>;
  perUnit(): Promise<{ unit: string; jumlah: number }[]>;
  averageDaysToFinish(): Promise<number | null>;
  notForwarded(): Promise<Row[]>;
  lastNumber(): Promise<Row | null>;
  myTaskCounts(userId: number): Promise<Record<string, number>>;
  newDispositionsFor(actor: Actor): Promise<Row[]>;
  myNearestTasks(userId: number): Promise<(Row & { deadline: string | null })[]>;
  searchIn(actor: Actor, f: SearchFilter): Promise<(Row & { status: string; deadline: string | null })[]>;
  searchOut(actor: Actor, f: SearchFilter): Promise<(Row & { status: string })[]>;
  archiveCounts(actor: Actor): Promise<{ masuk: { tahun: number; bulan: number; n: number }[]; keluar: { tahun: number; bulan: number; n: number }[] }>;
  archiveList(actor: Actor, f: { tahun: number; bulan: number; jenis: 'masuk' | 'keluar' }): Promise<Row[]>;
  yearStats(actor: Actor, tahun: number): Promise<{ masuk: number; selesai: number; terlambat: number; keluar: number; disposisi: number }>;
}

export interface ReportTable { judul: string; columns: string[]; rows: unknown[][] }
export interface ReportQueries {
  build(actor: Actor, jenis: 'surat-masuk' | 'surat-keluar' | 'disposisi' | 'tindak-lanjut' | 'kinerja', from: string, to: string): Promise<ReportTable[]>;
}

/* ======================= Layanan luar ======================= */

export interface FileStorage {
  /** Periksa ekstensi dan isi (magic bytes). Mengembalikan ekstensi; melempar AppError bila ditolak. */
  validate(file: IncomingFile): string;
  save(buffer: Buffer, ext: string): Promise<string>;
  read(path: string): Promise<Buffer>;
  mimeFor(ext: string): string;
}

export interface DefaultTemplate { nama: string; kode: string; jenis: string; deskripsi: string; kode_klasifikasi?: string; paragraphs: unknown[] }
export interface DocumentRenderer {
  extractFields(buffer: Buffer): TemplateField[];
  formatValues(fields: TemplateField[], raw: Record<string, unknown>): Record<string, string>;
  /** richFields: isian bertipe rich yang nilainya HTML editor dan diubah menjadi paragraf/tabel Word. */
  render(template: Buffer, values: Record<string, string>, richFields?: string[]): Buffer;
  toHtml(docx: Buffer): Promise<string>;
  toPdf(docx: Buffer): Promise<Buffer>;
  build(paragraphs: unknown[]): Buffer;
  defaultTemplates(): DefaultTemplate[];
}

/** preview: gambar halaman pertama (data URL PNG) bila masukannya PDF. */
export interface OcrResult { fields: Record<string, { value: string; conf: number; review?: boolean }>; missing: string[]; quality: { meanConf: number; warnings: string[] } & Record<string, unknown>; text: string; preview?: string }
export interface OcrEngine { recognize(image: Buffer): Promise<OcrResult> }
export interface QrEncoder { toDataUrl(text: string, width: number): Promise<string> }
export interface PasswordHasher { hash(pw: string): Promise<string>; verify(pw: string, stored: string): Promise<boolean> }
export interface SessionTokens { create(bytes?: number): string; hash(token: string): string }
export interface RateLimiter { hit(key: string, windowMs: number, max: number): void }

/* ---------- Cadangan ---------- */

export type BackupKind = 'manual' | 'otomatis' | 'sebelum-pemulihan' | 'unggahan' | 'drive';
export interface BackupInfo { nama: string; dibuat: string; jenis: BackupKind; label: string; tabel: Record<string, number>; file: number; ukuran: number }
export interface BackupStore {
  list(): Promise<BackupInfo[]>;
  info(nama: string): Promise<BackupInfo | null>;
  /** Path absolut arsip di disk (untuk diunduh atau diunggah ke Drive). */
  path(nama: string): string;
  create(jenis: BackupKind, label?: string): Promise<BackupInfo>;
  /** Ganti seluruh data dan file dengan isi arsip. Tidak membuat cadangan pengaman sendiri; use case yang melakukannya. */
  restore(nama: string): Promise<{ tabel: Record<string, number>; file: number; dibuat: string }>;
  remove(nama: string): Promise<void>;
  /** Hapus cadangan lama sejenis, sisakan `keep` terbaru. */
  prune(jenis: BackupKind, keep: number): Promise<void>;
  receive(source: AsyncIterable<Uint8Array> | NodeJS.ReadableStream, jenis: BackupKind): Promise<BackupInfo>;
  busy(): string | null;
}

/* ---------- Google Drive dan Spreadsheet ---------- */

/** Kredensial: akun layanan (JSON dari Google Cloud) atau OAuth akun Google biasa (refresh token). */
export type GoogleAuth =
  | { mode: 'service'; client_email: string; private_key: string }
  | { mode: 'oauth'; client_id: string; client_secret: string; refresh_token: string };

export interface DriveFile { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; webViewLink?: string }
export interface SheetTable { title: string; columns: string[]; rows: unknown[][] }

export interface GoogleApi {
  /** Alamat persetujuan OAuth untuk menghubungkan akun Google. */
  authUrl(clientId: string, redirectUri: string, state: string): string;
  /** Tukar kode persetujuan dengan refresh token. */
  exchangeCode(clientId: string, clientSecret: string, code: string, redirectUri: string): Promise<{ refresh_token: string; email: string | null }>;
  /** Email akun yang terhubung (memastikan kredensial dapat dipakai). */
  whoami(auth: GoogleAuth): Promise<string>;
  folder(auth: GoogleAuth, name: string, parentId: string | null): Promise<string>;
  /** Unggah file baru, atau ganti isi file `fileId` bila diberikan. */
  upload(auth: GoogleAuth, o: { name: string; mime: string; parentId: string; body: Buffer | { path: string; size: number }; fileId?: string | null }): Promise<DriveFile>;
  list(auth: GoogleAuth, parentId: string, nameContains?: string): Promise<DriveFile[]>;
  download(auth: GoogleAuth, fileId: string): Promise<ReadableStream<Uint8Array>>;
  remove(auth: GoogleAuth, fileId: string): Promise<void>;
  /** Buat spreadsheet baru di folder; mengembalikan ID-nya. */
  createSpreadsheet(auth: GoogleAuth, title: string, parentId: string): Promise<string>;
  /** Tulis ulang setiap lembar (dibuat bila belum ada) dengan judul kolom berformat. */
  writeSheets(auth: GoogleAuth, spreadsheetId: string, tables: SheetTable[]): Promise<void>;
  spreadsheetUrl(id: string): string;
}
