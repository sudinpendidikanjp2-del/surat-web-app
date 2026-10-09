import fs from 'node:fs';
import sharp from 'sharp';
import { createWorker, PSM } from 'tesseract.js';
import { preprocess } from '../src/ocr.js';
const pre = await preprocess(fs.readFileSync(`/tmp/ocr-corpus/${process.argv[2]}`));
const png = await pre.render('hard');
await sharp(png).resize({ width: 900 }).toFile('/tmp/d5.png');
const m = await sharp(png).metadata(); console.log(m.width, m.height);
// bagian atas saja vs bawah saja
for (const [name, region] of [['atas', { left: 0, top: 0, width: m.width, height: Math.floor(m.height * 0.5) }], ['bawah', { left: 0, top: Math.floor(m.height * 0.5), width: m.width, height: m.height - Math.floor(m.height * 0.5) }]]) {
  const part = await sharp(png).extract(region).png().toBuffer();
  const w = await createWorker('ind', 1, { langPath: '/home/user/surat-web-app/node_modules/@tesseract.js-data/ind/4.0.0_best_int', gzip: true, cacheMethod: 'none' });
  const t = Date.now();
  const r = await Promise.race([w.recognize(part, {}, { text: true }), new Promise((res) => setTimeout(() => res(null), 25000))]);
  console.log(name, r ? `${Date.now() - t}ms conf ${r.data.confidence}` : 'TIMEOUT');
  await w.terminate();
}
process.exit(0);
