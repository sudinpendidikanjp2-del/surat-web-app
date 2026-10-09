import fs from 'node:fs';
import { createWorker } from 'tesseract.js';
import { preprocess } from '../src/ocr.js';
const pre = await preprocess(fs.readFileSync(`/tmp/ocr-corpus/${process.argv[2]}`));
const png = await pre.render('hard');
for (const out of [{ text: true }, { blocks: true, text: true }]) {
  const w = await createWorker('ind', 1, { langPath: '/home/user/surat-web-app/node_modules/@tesseract.js-data/ind/4.0.0_best_int', gzip: true, cacheMethod: 'none' });
  await w.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1' });
  const t = Date.now();
  const r = await Promise.race([w.recognize(png, {}, out), new Promise((res) => setTimeout(() => res(null), 25000))]);
  console.log(JSON.stringify(out), r ? `${Date.now() - t}ms conf ${r.data.confidence}` : 'TIMEOUT');
  await w.terminate();
}
process.exit(0);
