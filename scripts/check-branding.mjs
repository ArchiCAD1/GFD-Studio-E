// Check the product identity at the boundaries where mismatches break installation,
// launching, file associations or exported files. Legacy readers and provenance may
// retain their original identifiers; new product outputs must use the manifest.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const brand = JSON.parse(read('branding.json'));
const pkg = JSON.parse(read('package.json'));

assert.equal(pkg.name, brand.packageName);
assert.equal(pkg.productName, brand.productName);
assert.equal(typeof pkg.author === 'string' ? pkg.author : pkg.author.name, brand.founder);
assert.ok(pkg.build.copyright.includes(brand.publisher));
assert.equal(pkg.build.appId, brand.appId);
assert.equal(pkg.repository.url, `git+${brand.repository}.git`);
assert.equal(pkg.bugs.url, `${brand.repository}/issues`);
assert.ok(pkg.build.artifactName.startsWith('GFD-Studio-E-'));
assert.equal(pkg.bin[brand.command], `dist-cli/${brand.command}.mjs`);
assert.ok(pkg.build.fileAssociations.some((entry) => entry.ext === brand.projectExtension && entry.name.startsWith(brand.productName)));
for (const path of ['public/icon.svg', 'public/icon-192.png', 'public/icon-512.png', 'build/icon.png',
  'docs/brand/gfd-studio-e-logo.svg', 'docs/brand/gfd-studio-e-logo-dark.svg',
  'build/gfde/gfde', 'build/gfde/gfde.cmd', 'engines/python/gfde_engine.py']) {
  assert.ok(existsSync(resolve(root, path)), `Missing GFD asset or entry point: ${path}`);
}
for (const path of ['index.html', 'public/icon.svg', 'docs/brand/gfd-studio-e-logo.svg',
  'docs/brand/gfd-studio-e-logo-dark.svg', 'vite.config.ts', 'vite.cli.config.ts',
  'build/gfde/gfde', 'build/gfde/gfde.cmd', 'electron/preload.cjs']) {
  assert.doesNotMatch(read(path), /LV[ _-]Design[ _-](?:Studio|Suite)|pdhruv15|com\.lvdesignstudio|\blvds\b/i, `Old active identity in ${path}`);
}
for (const [path, identity] of [
  ['electron/projectFiles.cjs', brand.projectFormat],
  ['src/model/projectBackup.ts', brand.backupExtension],
  ['src/model/specTemplates.ts', brand.specificationExtension],
  ['src/exchange/contracts.ts', brand.exchangeSchema],
  ['src/exchange/designContract.ts', brand.designSchema]
]) assert.ok(read(path).includes(identity), `Missing ${identity} in ${path}`);
for (const path of ['LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE.md']) {
  assert.ok(existsSync(resolve(root, path)), `Missing licence notice: ${path}`);
  assert.ok(pkg.build.files.includes(path), `Packaged app must carry ${path}`);
}
console.log(`Branding verified: ${brand.productName}, .${brand.projectExtension}, ${brand.command}, ${brand.appId}.`);
