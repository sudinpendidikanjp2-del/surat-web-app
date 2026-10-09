import fs from 'node:fs';
import { recognize, stopOcr } from '../src/ocr.js';
try {
  const t = Date.now();
  const r = await recognize(fs.readFileSync(`/tmp/ocr-corpus/${process.argv[2]}`));
  console.log(Date.now() - t, 'ms', r.quality, Object.keys(r.fields));
} catch (e) { console.log('ERR', e.message); }
await stopOcr(); process.exit(0);
