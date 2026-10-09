#!/usr/bin/env python3
"""Membuat korpus surat masuk sintetis berbahasa Indonesia beserta kunci jawaban, untuk mengukur akurasi OCR.
Tiga tingkat kondisi: A (pindaian bersih), B (foto ponsel baik), C (foto ponsel buruk). Deterministik (seed tetap)."""
import json, math, os, random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/ocr-corpus'
N = int(sys.argv[2]) if len(sys.argv) > 2 else 30
os.makedirs(OUT, exist_ok=True)
rnd = random.Random(20261009)
nprnd = np.random.default_rng(20261009)

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'
FONT_B = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
SANS = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
INSTANSI = [
 ('PEMERINTAH KOTA ADMINISTRASI JAKARTA PUSAT', 'SDN MENTENG 01', 'Jl. Besuki No. 4, Menteng, Jakarta Pusat', 'Kepala Sekolah'),
 ('PEMERINTAH KOTA ADMINISTRASI JAKARTA PUSAT', 'SMPN 7 JAKARTA', 'Jl. Cikini Raya No. 21, Jakarta Pusat', 'Kepala Sekolah'),
 ('DINAS KESEHATAN', 'PUSKESMAS KECAMATAN SENEN', 'Jl. Kramat Raya No. 128, Senen, Jakarta Pusat', 'Kepala Puskesmas'),
 ('YAYASAN PENDIDIKAN BANGSA', 'SMA BINA INSANI', 'Jl. Salemba Tengah No. 9, Jakarta Pusat', 'Ketua Yayasan'),
 ('PEMERINTAH KOTA ADMINISTRASI JAKARTA PUSAT', 'KELURAHAN CEMPAKA PUTIH', 'Jl. Letjen Suprapto No. 55, Jakarta Pusat', 'Lurah Cempaka Putih'),
 ('KEMENTERIAN AGAMA', 'MADRASAH ALIYAH NEGERI 3', 'Jl. Percetakan Negara No. 17, Jakarta Pusat', 'Kepala Madrasah'),
 ('UNIVERSITAS CONTOH NUSANTARA', 'FAKULTAS KEGURUAN DAN ILMU PENDIDIKAN', 'Jl. Diponegoro No. 3, Jakarta Pusat', 'Dekan'),
 ('PEMERINTAH KOTA ADMINISTRASI JAKARTA PUSAT', 'KECAMATAN GAMBIR', 'Jl. Kebon Sirih No. 31, Gambir, Jakarta Pusat', 'Camat Gambir'),
]
NAMA = ['Budi Santoso, S.Pd., M.M.', 'Siti Rahayu, S.Pd.', 'Drs. Ahmad Fauzi', 'Dra. Ratna Sari, M.Pd.', 'H. Mulyadi, S.E.', 'Dewi Lestari, S.Kom.', 'Agus Prasetyo, S.Pd.']
PERIHAL = [
 'Permohonan data peserta didik tahun ajaran 2026/2027', 'Undangan rapat koordinasi persiapan ujian sekolah',
 'Permohonan izin kunjungan belajar ke museum', 'Laporan pelaksanaan kegiatan pekan olahraga',
 'Permohonan bantuan sarana dan prasarana laboratorium', 'Pemberitahuan perubahan jadwal penerimaan siswa baru',
 'Usulan peserta pelatihan guru tingkat kota', 'Permohonan rekomendasi pembukaan kelas tambahan',
 'Konfirmasi kehadiran pada acara peringatan hari pendidikan', 'Permohonan verifikasi data penerima bantuan pendidikan',
]
SIFAT = ['Biasa', 'Segera', 'Penting', 'Rahasia']
LAMP = ['-', '1 berkas', '2 lembar', '3 (tiga) berkas', '1 (satu) bendel']
KODE = ['SDN-01', 'SMPN7', 'PKM-SNN', 'YPB', 'KEL.CP', 'MAN3', 'FKIP', 'KEC.GBR']
BODY = [
 'Dengan hormat, sehubungan dengan pelaksanaan program pendidikan pada tahun ajaran berjalan, bersama ini kami menyampaikan permohonan sebagaimana perihal tersebut di atas. Kami berharap Bapak/Ibu berkenan memberikan tanggapan sesuai ketentuan yang berlaku.',
 'Demikian surat ini kami sampaikan. Atas perhatian dan kerja sama Bapak/Ibu, kami ucapkan terima kasih.',
]

def wrap(draw, text, font, width):
    out, cur = [], ''
    for w in text.split():
        t = (cur + ' ' + w).strip()
        if draw.textlength(t, font=font) <= width: cur = t
        else: out.append(cur); cur = w
    if cur: out.append(cur)
    return out

def make_letter(i):
    parent, inst, alamat, jab = INSTANSI[i % len(INSTANSI)]
    day, mon = rnd.randint(1, 28), rnd.randint(1, 12)
    nomor = rnd.choice([
        f'{rnd.randint(100,999)}/{rnd.randint(1,300)}/{KODE[i%len(KODE)]}/{["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"][mon-1]}/2026',
        f'{rnd.choice(["005","421","800"])}/{rnd.randint(1,99)}-{rnd.randint(1,9)}.{rnd.randint(1,9)}/{KODE[i%len(KODE)]}/2026',
        f'B-{rnd.randint(10,999)}/{KODE[i%len(KODE)]}/{["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"][mon-1]}/2026',
    ])
    perihal, sifat, lamp, nama = rnd.choice(PERIHAL), rnd.choice(SIFAT), rnd.choice(LAMP), rnd.choice(NAMA)
    W, H = 1654, 2339  # A4 pada 200 dpi
    img = Image.new('L', (W, H), 255)
    d = ImageDraw.Draw(img)
    f_kop1, f_kop2 = ImageFont.truetype(FONT_B, 30), ImageFont.truetype(FONT_B, 40)
    f_small, f, fb = ImageFont.truetype(FONT, 24), ImageFont.truetype(FONT, 30), ImageFont.truetype(FONT_B, 30)
    y = 90
    for txt, fnt in ((parent, f_kop1), (inst, f_kop2)):
        d.text((W/2, y), txt, font=fnt, fill=0, anchor='ma'); y += fnt.size + 8
    d.text((W/2, y), alamat, font=f_small, fill=0, anchor='ma'); y += 40
    d.line([(120, y), (W-120, y)], fill=0, width=5); y += 60
    d.text((W-130, y), f'Jakarta, {day} {BULAN[mon-1]} 2026', font=f, fill=0, anchor='ra'); y += 70
    rows = [('Nomor', nomor), ('Sifat', sifat), ('Lampiran', lamp), ('Perihal', perihal)]
    for k, v in rows:
        d.text((130, y), k, font=f, fill=0)
        d.text((330, y), ':', font=f, fill=0)
        lines = wrap(d, v, fb if k == 'Perihal' else f, W - 130 - 360)
        for ln in lines:
            d.text((360, y), ln, font=fb if k == 'Perihal' else f, fill=0); y += 44
        y += 6
    y += 30
    d.text((130, y), 'Yth. Kepala Suku Dinas Pendidikan', font=f, fill=0); y += 44
    d.text((130, y), 'di', font=f, fill=0); y += 44
    d.text((130, y), 'Tempat', font=f, fill=0); y += 70
    for para in BODY:
        for ln in wrap(d, para, f, W - 260):
            d.text((130, y), ln, font=f, fill=0); y += 44
        y += 26
    y += 40
    d.text((W-130, y), jab + ',', font=f, fill=0, anchor='ra'); y += 160
    d.text((W-130, y), nama, font=fb, fill=0, anchor='ra')
    truth = {'no_surat': nomor, 'tgl_surat': f'2026-{mon:02d}-{day:02d}', 'instansi': inst, 'alamat': alamat, 'perihal': perihal, 'sifat': sifat, 'lampiran': '' if lamp == '-' else lamp, 'asal': jab}
    return img, truth

def degrade(img, tier):
    W, H = img.size
    if tier == 'A':
        return img, 'png'
    cfg = {'B': dict(rot=2.0, blur=0.7, width=2300, shade=0.25, noise=6, q=72, persp=0.012),
           'C': dict(rot=4.0, blur=1.5, width=1250, shade=0.4, noise=14, q=45, persp=0.025)}[tier]
    ang = rnd.uniform(-cfg['rot'], cfg['rot'])
    bg = 200
    img = img.rotate(ang, resample=Image.BICUBIC, expand=True, fillcolor=bg)
    w, h = img.size
    p = cfg['persp']
    dx = [rnd.uniform(-p, p) * w for _ in range(4)]; dy = [rnd.uniform(-p, p) * h for _ in range(4)]
    img = img.transform((w, h), Image.QUAD, (dx[0], dy[0], dx[1], h + dy[1], w + dx[2], h + dy[2], w + dx[3], dy[3]), Image.BICUBIC, fillcolor=bg)
    s = cfg['width'] / w
    img = img.resize((int(w * s), int(h * s)), Image.LANCZOS)
    if cfg['blur']: img = img.filter(ImageFilter.GaussianBlur(cfg['blur']))
    a = np.asarray(img, dtype=np.float32)
    h2, w2 = a.shape
    gx = np.linspace(1 - cfg['shade'] * rnd.random(), 1, w2)[None, :]
    gy = np.linspace(1, 1 - cfg['shade'] * rnd.random(), h2)[:, None]
    a = a * gx * gy * rnd.uniform(0.85, 1.0)
    a += nprnd.normal(0, cfg['noise'], a.shape)
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'L')
    return img, f'jpg:{cfg["q"]}'

meta = {}
for i in range(N):
    img, truth = make_letter(i)
    for tier in 'ABC':
        out, fmt = degrade(img.copy(), tier)
        name = f'{i:03d}-{tier}'
        if fmt == 'png': out.save(f'{OUT}/{name}.png')
        else: out.convert('RGB').save(f'{OUT}/{name}.jpg', quality=int(fmt.split(':')[1]))
        meta[name] = {'tier': tier, 'file': f'{name}.{"png" if fmt == "png" else "jpg"}', 'truth': truth}
json.dump(meta, open(f'{OUT}/truth.json', 'w'), ensure_ascii=False, indent=1)
print('korpus', len(meta), 'gambar ->', OUT)
