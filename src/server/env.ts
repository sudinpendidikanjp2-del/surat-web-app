import path from 'node:path';

/**
 * Membaca dan memeriksa variabel lingkungan. Fungsi murni (tanpa server-only) agar dapat diuji langsung.
 *
 * Nilai yang tidak valid diganti nilai bawaan dan dicatat sebagai masalah; server menolak menyala bila ada
 * masalah (lihat assertConfig di boot.ts). Pemeriksaan tidak dijalankan saat `next build`, sehingga build tidak
 * membutuhkan rahasia produksi. Pesan masalah tidak pernah memuat nilai variabelnya (bisa berisi kata sandi).
 */
export type Env = Record<string, string | undefined>;

const OCR_ENGINES = ['auto', 'tesseract', 'gemini', 'remote'] as const;
const DEV_DATABASE_URL = 'postgres://surat:surat_dev@localhost:5432/surat';

export function parseConfig(env: Env, cwd = process.cwd()) {
  const problems: string[] = [];
  const warnings: string[] = [];
  const production = env.NODE_ENV === 'production';

  const text = (name: string, fallback: string) => {
    const v = env[name]?.trim();
    return v ? v : fallback;
  };
  /** Bilangan positif (boleh pecahan) dengan batas atas yang masuk akal. */
  const num = (name: string, fallback: number, max: number) => {
    const raw = env[name]?.trim();
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || n > max) {
      problems.push(`${name} harus angka lebih dari 0 dan paling besar ${max}`);
      return fallback;
    }
    return n;
  };
  const flag = (name: string, on: string, off: string, fallback: boolean) => {
    const raw = env[name]?.trim().toLowerCase();
    if (!raw) return fallback;
    if (raw === on) return true;
    if (raw === off) return false;
    problems.push(`${name} hanya boleh "${on}" atau "${off}"`);
    return fallback;
  };
  const url = (name: string, fallback: string, protocols: string[]) => {
    const raw = env[name]?.trim();
    if (!raw) return fallback;
    try {
      const u = new URL(raw);
      if (!protocols.includes(u.protocol)) throw new Error();
      return raw.replace(/\/+$/, '');
    } catch {
      problems.push(`${name} harus berupa alamat ${protocols.map((p) => p.replace(':', '')).join(' atau ')} yang lengkap`);
      return fallback;
    }
  };

  if (production && !env.DATABASE_URL?.trim()) problems.push('DATABASE_URL wajib diisi di produksi');
  const databaseUrl = url('DATABASE_URL', DEV_DATABASE_URL, ['postgres:', 'postgresql:']);

  const appUrl = url('APP_URL', '', ['http:', 'https:']);
  if (production && !appUrl) {
    warnings.push('APP_URL belum diisi: alamat QR, tautan pelacakan, dan alamat balik Google diambil dari header permintaan');
  }

  const timezone = text('APP_TZ', 'Asia/Jakarta');
  try {
    new Intl.DateTimeFormat('id-ID', { timeZone: timezone });
  } catch {
    problems.push('APP_TZ bukan zona waktu IANA yang dikenal (contoh: Asia/Jakarta)');
  }

  const engine = text('OCR_ENGINE', 'auto').toLowerCase();
  if (!(OCR_ENGINES as readonly string[]).includes(engine)) problems.push(`OCR_ENGINE hanya boleh ${OCR_ENGINES.join(', ')}`);
  if (engine === 'gemini' && !env.GEMINI_API_KEY?.trim()) problems.push('OCR_ENGINE=gemini membutuhkan GEMINI_API_KEY');
  if (engine === 'remote' && !env.OCR_URL?.trim()) problems.push('OCR_ENGINE=remote membutuhkan OCR_URL');

  let extra: Record<string, unknown> = {};
  if (env.OCR_EXTRA_JSON?.trim()) {
    try {
      const parsed: unknown = JSON.parse(env.OCR_EXTRA_JSON);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      extra = parsed as Record<string, unknown>;
    } catch {
      problems.push('OCR_EXTRA_JSON harus berupa objek JSON, misalnya {"top_k":1}');
    }
  }

  const seedPassword = env.SEED_PASSWORD?.trim() || undefined;
  if (seedPassword && seedPassword.length < 8) problems.push('SEED_PASSWORD minimal 8 karakter');

  const config = {
    databaseUrl,
    production,
    /** Alamat publik aplikasi tanpa garis miring akhir, misalnya https://surat.contoh.go.id. Kosong: dari permintaan. */
    appUrl,
    /**
     * true hanya bila aplikasi di belakang reverse proxy tepercaya (Nginx, Caddy, Traefik) dan tidak dapat
     * dijangkau langsung. Hanya saat itu IP klien dan protokol dibaca dari header proxy.
     */
    trustProxy: flag('TRUST_PROXY', 'true', 'false', false),
    storageDir: text('STORAGE_DIR', path.resolve(cwd, 'storage/private')),
    sessionHours: num('SESSION_HOURS', 12, 24 * 30),
    maxUploadBytes: num('MAX_UPLOAD_MB', 15, 1024) * 1024 * 1024,
    reminderEveryMs: num('REMINDER_EVERY_MIN', 10, 24 * 60) * 60 * 1000,
    jobsEnabled: flag('JOBS', 'on', 'off', true),
    seedPassword,
    /** Zona waktu kantor untuk jadwal cadangan dan sinkronisasi harian. */
    timezone,
    /** Cadangan disimpan di luar folder lampiran agar tidak ikut tercadangkan. */
    backupDir: text('BACKUP_DIR', path.resolve(cwd, 'storage/backups')),
    backupMaxBytes: num('BACKUP_MAX_MB', 4096, 1024 * 1024) * 1024 * 1024,
    /** Google Drive dan Spreadsheet. Kredensial diatur admin di aplikasi; alamat dapat diganti untuk pengujian. */
    google: {
      urls: {
        oauth: url('GOOGLE_OAUTH_URL', 'https://oauth2.googleapis.com', ['http:', 'https:']),
        accounts: url('GOOGLE_ACCOUNTS_URL', 'https://accounts.google.com', ['http:', 'https:']),
        api: url('GOOGLE_API_URL', 'https://www.googleapis.com', ['http:', 'https:']),
        sheets: url('GOOGLE_SHEETS_URL', 'https://sheets.googleapis.com', ['http:', 'https:']),
      },
    },
    /**
     * Mesin OCR. Bawaan: Tesseract di dalam proses. Opsional: Gemini (Google) bila GEMINI_API_KEY diisi,
     * atau model VLM (misalnya baidu/Unlimited-OCR) di server GPU lewat vLLM atau SGLang (API kompatibel OpenAI).
     * OCR_ENGINE: auto (bawaan: Gemini bila ada kunci, selain itu Tesseract), gemini, remote, atau tesseract.
     */
    ocr: {
      engine,
      geminiKey: text('GEMINI_API_KEY', ''),
      geminiModel: text('GEMINI_MODEL', 'gemini-2.5-flash'),
      geminiUrl: url('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com', ['http:', 'https:']),
      url: url('OCR_URL', '', ['http:', 'https:']),
      model: text('OCR_MODEL', 'Unlimited-OCR'),
      prompt: text('OCR_PROMPT', 'document parsing.'),
      timeoutMs: num('OCR_TIMEOUT_SEC', 120, 3600) * 1000,
      extra,
      fallback: flag('OCR_FALLBACK', 'on', 'off', true),
    },
  };
  return { config, problems, warnings };
}

export type AppConfig = ReturnType<typeof parseConfig>['config'];
