import fs from 'node:fs';
import sharp from 'sharp';
import { preprocess } from '../src/ocr.js';
const pre = await preprocess(fs.readFileSync(`/tmp/ocr-corpus/${process.argv[2]}`));
console.log('noise', pre.noise, 'angle', pre.angle, 'sharp', Math.round(pre.sharpness));
await sharp(await pre.render('hard')).resize({ width: 900 }).toFile('/tmp/d3.png');
process.exit(0);
