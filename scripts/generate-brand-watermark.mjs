#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = `${root}public/gfd-company-logo.png`;
const outputs = [`${root}src/assets/gfd-company-logo-watermark.png`];
const opacity = 0.1;
const logo = PNG.sync.read(readFileSync(source));
for (let i = 0; i < logo.data.length; i += 4) {
  const grey = Math.round(0.2126 * logo.data[i] + 0.7152 * logo.data[i + 1] + 0.0722 * logo.data[i + 2]);
  logo.data[i] = grey;
  logo.data[i + 1] = grey;
  logo.data[i + 2] = grey;
  logo.data[i + 3] = Math.round(logo.data[i + 3] * opacity);
}
const bytes = PNG.sync.write(logo);
for (const output of outputs) {
  mkdirSync(output.slice(0, output.lastIndexOf('/')), { recursive: true });
  writeFileSync(output, bytes);
}
console.log(`Created 10% watermark assets from ${source}.`);
