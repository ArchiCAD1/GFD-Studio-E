import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve, sep } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM script without type declarations
import { asarFiles, badNoticesIn, LOCALE_FILES, GFDE_FILES, PRODUCT_NOTICES, MAC_LANGUAGES, MAC_NOTICES, MAX_ASAR_MB, NOTICES, packageProblems } from '../scripts/check-package.mjs';
// @ts-expect-error — plain ESM script without type declarations
import { launcherOf, gfdeProblems, mcpSession, shownVersion } from '../scripts/check-packaged-gfde.mjs';
// @ts-expect-error — plain CommonJS script without type declarations
import { afterPack, writeNotices } from '../scripts/mac-licences.cjs';
import { displayVersion } from '../src/model/appVersion';

// What the installed app carries. electron-builder adds production dependencies to the package unless told
// not to, although they are all compiled into dist and dist-electron. CI lists a real package with
// scripts/check-package.mjs; these tests check the settings and what they rely on.
const root = resolve(__dirname, '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');
const pkg = JSON.parse(read('package.json')) as {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  overrides: { exceljs: { uuid: string } };
  build: { files: string[]; electronLanguages: string[]; afterPack: string; extraResources: { from: string; to: string; filter?: string[] }[] };
};

describe('package filter', () => {
  it('carries only the built app and the main process, without node_modules', () => {
    expect(pkg.build.files.filter((f) => !f.startsWith('!'))).toEqual(['dist/**/*', 'dist-electron/**/*', 'electron/**/*', 'branding.json', 'LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE.md', 'docs/provenance/**/*']);
    expect(pkg.build.files).toContain('!node_modules/**/*');
  });

  it('carries the CAD engine once: the window gets it from electron/cad, the web version from dist/assets', () => {
    expect(pkg.build.files).toContain('!dist/assets/gfde_cad_reader_bg-*.wasm');
    expect(existsSync(join(root, 'electron/cad/gfde_cad_reader_bg.wasm'))).toBe(true);
    expect(read('electron/cadFile.cjs')).toContain("path.join(CAD_DIR, 'gfde_cad_reader_bg.wasm')");
    expect(read('src/engines/cad/cadEngine.ts')).toContain('window.gfde?.cadFile?.engine');
  });

  it('keeps English on every system: Mac folders are en, en_GB; Windows and Linux files are en-US, en-GB', () => {
    // Names are matched exactly: "en" alone would delete en-US.pak, the file Chromium falls back to on Windows and Linux.
    expect(pkg.build.electronLanguages).toEqual(['en', 'en_GB', 'en-US', 'en-GB']);
  });

  it('builds the file the main process loads, and keeps the licence texts that node_modules used to carry', () => {
    expect(pkg.scripts.build).toContain('vite build -c vite.electron.config.ts');
    expect(read('vite.electron.config.ts')).toContain("outDir: 'dist-electron'");
    expect(read('vite.electron.config.ts')).toContain("entryFileNames: 'exceljs.cjs'");
    for (const config of ['vite.config.ts', 'vite.electron.config.ts']) expect(read(config), config).toContain("license: { fileName: 'third-party-licences.md' }");
  });

  it('carries the gfde command beside the app: the one-file build, its licence texts and a launcher per system', () => {
    expect(pkg.scripts.build).toContain('vite build -c vite.cli.config.ts');
    expect(read('vite.cli.config.ts')).toContain("license: { fileName: 'third-party-licences.md' }");
    expect(pkg.build.extraResources).toContainEqual({ from: 'dist-cli', to: 'gfde', filter: ['gfde.mjs', 'third-party-licences.md'] });
    expect(pkg.build.extraResources).toContainEqual({ from: 'build/gfde', to: 'gfde' });
    // Together they are what scripts/check-package.mjs looks for in a real package.
    expect([...readdirSync(join(root, 'build/gfde')), 'gfde.mjs', 'third-party-licences.md', 'LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE.md', 'docs'].sort()).toEqual([...GFDE_FILES].sort());
    if (process.platform !== 'win32') expect(statSync(join(root, 'build/gfde/gfde')).mode & 0o111).not.toBe(0);
    // Both launchers run gfde.mjs with the app as Node, so no window opens and no separate Node is needed.
    for (const launcher of ['build/gfde/gfde', 'build/gfde/gfde.cmd']) expect(read(launcher), launcher).toContain('ELECTRON_RUN_AS_NODE=1');
    expect(read('build/gfde/gfde.cmd')).toContain('"%~dp0..\\..\\GFD Studio E.exe" "%~dp0gfde.mjs" %*');
  });

  it('keeps the compiled libraries in dependencies, so the audit of what ships (scripts/check-audit.mjs) still covers them', () => {
    for (const lib of ['docx', 'dompurify', 'exceljs', 'jszip', 'lucide-react', 'pdf-lib', 'react', 'react-dom', 'zod']) expect(pkg.dependencies, lib).toHaveProperty(lib);
  });
});

describe("Electron's licence texts in the Mac app", () => {
  const inTemp = (check: (dir: string) => void) => {
    const dir = mkdtempSync(join(tmpdir(), 'gfde-notices-'));
    try { check(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
  };

  it('runs after packing, before the app is signed', () => {
    expect(pkg.build.afterPack).toBe('./scripts/mac-licences.cjs');
    expect(existsSync(join(root, pkg.build.afterPack))).toBe(true);
  });

  it('writes the Electron licence as it is and the Chromium list gzipped, and the package check reads them', () => {
    inTemp((dir) => {
      const download: Record<string, string> = { LICENSE: 'Copyright (c) Electron', 'LICENSES.chromium.html': '<html>credits</html>'.repeat(1000) };
      writeNotices(dir, (name: string) => Buffer.from(download[name]));
      expect(readFileSync(join(dir, 'LICENSE.electron.txt'), 'utf8')).toBe(download.LICENSE);
      const gz = readFileSync(join(dir, 'LICENSES.chromium.html.gz'));
      expect(gunzipSync(gz).toString()).toBe(download['LICENSES.chromium.html']);
      expect(gz.length).toBeLessThan(download['LICENSES.chromium.html'].length / 10);
      expect(badNoticesIn(dir, MAC_NOTICES)).toEqual([]);
    });
  });

  it('keeps Windows and Linux Electron notices and copies complete product notices beside the CLI', async () => {
    for (const electronPlatformName of ['win32', 'linux']) {
      const dir = mkdtempSync(join(tmpdir(), 'gfde-package-notices-'));
      try {
        writeFileSync(join(dir, 'LICENSE.electron.txt'), 'runtime notice');
        await afterPack({ electronPlatformName, appOutDir: dir, packager: { info: { projectDir: root } } });
        expect(readFileSync(join(dir, 'LICENSE.electron.txt'), 'utf8')).toBe('runtime notice');
        for (const name of PRODUCT_NOTICES) {
          expect(readFileSync(join(dir, 'resources/gfde', name))).toEqual(readFileSync(join(root, name)));
        }
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
  });

  it('stops the build when a text is missing from the download', () => {
    inTemp((dir) => {
      expect(() => writeNotices(dir, () => { throw new Error('unzip: LICENSE not found'); })).toThrow('LICENSE not found');
    });
  });

  it('finds a text that is missing, empty or not really gzipped', () => {
    inTemp((dir) => {
      expect(badNoticesIn(dir, NOTICES)).toEqual(NOTICES);
      writeFileSync(join(dir, 'LICENSE.electron.txt'), '');
      writeFileSync(join(dir, 'LICENSES.chromium.html'), 'credits');
      expect(badNoticesIn(dir, NOTICES)).toEqual(['LICENSE.electron.txt']);
      writeFileSync(join(dir, 'LICENSES.chromium.html.gz'), 'not gzipped');
      expect(badNoticesIn(dir, ['LICENSES.chromium.html.gz'])).toEqual(['LICENSES.chromium.html.gz']);
      writeFileSync(join(dir, 'LICENSES.chromium.html.gz'), gzipSync('credits'));
      expect(badNoticesIn(dir, ['LICENSES.chromium.html.gz'])).toEqual([]);
    });
  });
});

describe.skipIf(process.platform === 'win32')('the gfde launcher of the package (macOS, Linux)', () => {
  // A stand-in for the app: it prints how it was started.
  const standIn = '#!/bin/sh\necho "node=$ELECTRON_RUN_AS_NODE"\nfor a in "$@"; do echo "arg=$a"; done\n';
  const inPackage = (app: string, resources: string, check: (dir: string, launcher: string) => void) => {
    const dir = mkdtempSync(join(tmpdir(), 'gfde-launcher-'));
    try {
      const launcher = join(dir, resources, 'gfde', 'gfde');
      mkdirSync(dirname(launcher), { recursive: true });
      copyFileSync(join(root, 'build/gfde/gfde'), launcher);
      chmodSync(launcher, 0o755);
      if (app) {
        mkdirSync(dirname(join(dir, app)), { recursive: true });
        writeFileSync(join(dir, app), standIn, { mode: 0o755 });
      }
      check(dir, launcher);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  };
  const started = (launcher: string, ...args: string[]) => execFileSync(launcher, args, { encoding: 'utf8' }).trim().split('\n');

  it('on a Mac runs gfde.mjs with the app in Contents/MacOS, as Node', () => {
    inPackage('GFD Studio E.app/Contents/MacOS/GFD Studio E', 'GFD Studio E.app/Contents/Resources', (dir, launcher) => {
      expect(started(launcher, 'check', 'My project')).toEqual(['node=1', `arg=${join(dir, 'GFD Studio E.app/Contents/Resources/gfde/gfde.mjs')}`, 'arg=check', 'arg=My project']);
    });
  });

  it('on Linux runs it with the program beside resources', () => {
    inPackage('gfd-studio-e', 'resources', (dir, launcher) => {
      expect(started(launcher, 'mcp')).toEqual(['node=1', `arg=${join(dir, 'resources/gfde/gfde.mjs')}`, 'arg=mcp']);
    });
  });

  it('works through a link to it', () => {
    inPackage('gfd-studio-e', 'resources', (dir, launcher) => {
      mkdirSync(join(dir, 'bin'));
      symlinkSync(launcher, join(dir, 'bin', 'gfde'));
      symlinkSync('gfde', join(dir, 'bin', 'gfde2'));
      for (const link of ['gfde', 'gfde2']) expect(started(join(dir, 'bin', link), 'version'), link).toEqual(['node=1', `arg=${join(dir, 'resources/gfde/gfde.mjs')}`, 'arg=version']);
    });
  });

  it('says so when the app is not beside it', () => {
    inPackage('', 'resources', (_dir, launcher) => {
      expect(() => execFileSync(launcher, ['version'], { encoding: 'utf8', stdio: 'pipe' })).toThrow(/GFD Studio E was not found/);
    });
  });
});

describe('scripts/check-packaged-gfde.mjs', () => {
  const tools = Array.from({ length: 21 }, (_, i) => ({ name: `tool_${i}`, annotations: { readOnlyHint: true } }));
  const config = { mcpServers: { 'gfd-studio-e': { command: '/app/GFD Studio E', args: ['/app/resources/gfde/gfde.mjs', 'mcp'], env: { ELECTRON_RUN_AS_NODE: '1' } } } };
  const clean = () => ({ version: '2.151', expected: '2.151', config, session: { server: { name: 'gfd-studio-e', version: '2.151' }, tools, projects: { content: [{ type: 'text', text: '[]' }] } } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each test breaks one field of a good answer
  const problems = (change: (p: any) => void) => {
    const p = clean();
    change(p);
    return gfdeProblems(p).join('\n');
  };

  it('shows the version as the app does, beta builds included', () => {
    for (const v of ['2.11.0', '2.151.0', '2.150.0-beta.1', '3.0.0']) expect(shownVersion(v), v).toBe(displayVersion(v));
  });

  it('finds the launcher of each kind of package', () => {
    expect(launcherOf('release/mac-arm64/GFD Studio E.app', 'darwin')).toBe(join('release/mac-arm64/GFD Studio E.app', 'Contents/Resources', 'gfde', 'gfde'));
    expect(launcherOf('release/linux-unpacked', 'linux')).toBe(join('release/linux-unpacked', 'resources', 'gfde', 'gfde'));
    expect(launcherOf('release/win-unpacked', 'win32')).toBe(join('release/win-unpacked', 'resources', 'gfde', 'gfde.cmd'));
  });

  it('passes a packaged gfde that answers as the app version, read only', () => {
    expect(gfdeProblems(clean())).toEqual([]);
  });

  it('finds another version, missing settings, too few tools, a change tool without --write and a failed call', () => {
    expect(problems((p) => { p.version = '2.146'; })).toContain('gfde version says "2.146", package.json means 2.151');
    expect(problems((p) => { p.config = {}; p.session = undefined; })).toContain('did not print the settings of the MCP server');
    expect(problems((p) => { p.session.server.version = '2.146'; })).toContain('not gfd-studio-e 2.151');
    expect(problems((p) => { p.session.tools = tools.slice(0, 3); })).toContain('lists 3 tools');
    expect(problems((p) => { p.session.tools = [...tools, { name: 'add_panel', annotations: { readOnlyHint: false } }]; })).toContain('offers tools that change a project: add_panel');
    expect(problems((p) => { p.session.projects = { isError: true, content: [{ type: 'text', text: 'no folder' }] }; })).toContain('list_projects failed');
  });

  it('talks to an MCP server over its stdin and stdout, and reports one that stops', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gfde-mcp-'));
    try {
      // A stand-in server: one JSON message per line, as the MCP stdio transport sends them.
      writeFileSync(join(dir, 'server.mjs'), `
        import { createInterface } from 'node:readline';
        const answers = { initialize: { serverInfo: { name: 'gfd-studio-e', version: process.env.SHOWN } }, 'tools/list': { tools: [{ name: 'list_projects' }] }, 'tools/call': { content: [{ type: 'text', text: '[]' }] } };
        createInterface({ input: process.stdin }).on('line', (line) => {
          const m = JSON.parse(line);
          if (m.id) console.log(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: answers[m.method] }));
        });
      `);
      const session = await mcpSession({ command: process.execPath, args: [join(dir, 'server.mjs')], env: { ...process.env, SHOWN: '2.151' } });
      expect(session).toEqual({ server: { name: 'gfd-studio-e', version: '2.151' }, tools: [{ name: 'list_projects' }], projects: { content: [{ type: 'text', text: '[]' }] } });
      writeFileSync(join(dir, 'stops.mjs'), 'console.error("no projects folder"); process.exit(3);');
      await expect(mcpSession({ command: process.execPath, args: [join(dir, 'stops.mjs')], env: process.env })).rejects.toThrow(/stopped \(exit 3\) no projects folder/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('what the main process may load', () => {
  // electron/*.cjs and the CAD reader's glue run from the package as they are, so a package they load would be missing there.
  const files = (readdirSync(join(root, 'electron'), { recursive: true }) as string[]).map((f) => f.split(sep).join('/')).filter((f) => /\.c?js$/.test(f));
  const code = (file: string) => read(`electron/${file}`).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const loads = (file: string) => [...code(file).matchAll(/\b(?:require|import)\(\s*(.+?)\s*[,)]/g)].map((m) => m[1]);
  const literal = (spec: string) => /^'([^']+)'$/.exec(spec)?.[1];
  const builtin = (name: string) => name === 'electron' || name.startsWith('node:') || builtinModules.includes(name);

  it('finds the files', () => {
    expect(files).toEqual(expect.arrayContaining(['main.cjs', 'database.cjs', 'preload.cjs', 'cad/gfde_cad_reader.js']));
    expect(loads('database.cjs')).toContain("'./limits.cjs'");
  });

  it('needs no package but ExcelJS, and that only before a build', () => {
    const packages = files.flatMap((f) => loads(f).map(literal).filter((n): n is string => !!n && !n.startsWith('.') && !builtin(n)).map((n) => `${f}: ${n}`));
    expect(packages).toEqual(['database.cjs: exceljs']);
    // The bundled file comes first: the installed library is what a package does not have.
    expect(code('database.cjs')).toContain("fs.existsSync(EXCELJS_BUNDLE) ? require('../dist-electron/exceljs.cjs') : require('exceljs')");
  });

  it('loads its own files from what the package carries', () => {
    const own = files.flatMap((f) => loads(f).map(literal).filter((n): n is string => !!n && n.startsWith('.')).map((n) => posix.join(posix.dirname(`electron/${f}`), n)));
    expect(own.length).toBeGreaterThan(10);
    for (const f of own) {
      if (f === 'dist-electron/exceljs.cjs') continue; // built by vite.electron.config.ts
      if (f === 'branding.json') { expect(existsSync(join(root, f))).toBe(true); continue; }
      expect(f.startsWith('electron/') && existsSync(join(root, f)), f).toBe(true);
    }
  });

  it('loads nothing by a computed name, which the tests above could not see', () => {
    const computed = files.flatMap((f) => loads(f).filter((s) => !literal(s)).map((s) => `${f}: ${s}`));
    expect(computed).toEqual(['cadFile.cjs: `${pathToFileURL(path.join(CAD_DIR']); // the reader in electron/cad
  });
});

describe('ExcelJS for the main process', () => {
  it('imports and exports a database workbook from the layout of the package, with no node_modules to fall back on', () => {
    const app = mkdtempSync(join(tmpdir(), 'gfde-package-'));
    try {
      execFileSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '-c', 'vite.electron.config.ts', '--outDir', join(app, 'dist-electron'), '--logLevel', 'error'], { cwd: root, env: { ...process.env, NODE_ENV: 'production' } });
      cpSync(join(root, 'electron'), join(app, 'electron'), { recursive: true });
      writeFileSync(join(app, 'check.cjs'), `
        const database = require('./electron/database.cjs');
        const exceljs = () => Object.keys(require.cache).filter((k) => k.includes('exceljs') || k.includes('node_modules'));
        (async () => {
          const atStart = exceljs();
          const { created } = await database.ensureDatabase(__dirname);
          await database.writeBook(__dirname, 'busbar', [{ material: 'Cu', ratingA: 800, rMohmPerM: 0.08, xMohmPerM: 0.02 }]);
          const read = await database.readDatabase(__dirname);
          console.log(JSON.stringify({ atStart, created: created.length, ratingA: read.books.busbar.rows[0].ratingA, loaded: exceljs().map((k) => k.slice(__dirname.length + 1)) }));
        })().catch((e) => { console.error(e); process.exit(1); });
      `);
      // Outside the repository, with no NODE_PATH: a library left out of the file cannot be found.
      const out = JSON.parse(execFileSync(process.execPath, ['check.cjs'], { cwd: app, encoding: 'utf8', env: { ...process.env, NODE_PATH: '' } }));
      expect(out.atStart).toEqual([]);
      expect(out.created).toBeGreaterThan(5);
      expect(out.ratingA).toBe(800);
      expect(out.loaded).toEqual([join('dist-electron', 'exceljs.cjs')]);
      expect(readdirSync(join(app, 'dist-electron')).sort()).toEqual(['exceljs.cjs', 'third-party-licences.md']);
      const licences = readFileSync(join(app, 'dist-electron/third-party-licences.md'), 'utf8');
      expect(licences).toContain('## exceljs - ');
      // docs/engineering/dependency-overrides.md: the main process gets the overridden uuid.
      expect(licences).toContain(`## uuid - ${pkg.overrides.exceljs.uuid} `);
    } finally {
      rmSync(app, { recursive: true, force: true });
    }
  }, 120_000);
});

describe('scripts/check-package.mjs', () => {
  const clean = () => ({
    files: [...PRODUCT_NOTICES, 'package.json', 'branding.json', 'dist/index.html', 'dist/gfd-company-logo.png', 'dist/third-party-licences.md', 'dist/assets/index-abc.js', 'dist-electron/exceljs.cjs', 'dist-electron/third-party-licences.md', 'electron/main.cjs', 'electron/cad/gfde_cad_reader_bg.wasm'],
    asarMb: 11.6,
    languages: { locales: { found: ['en-US.pak', 'en-GB.pak'], expected: LOCALE_FILES }, framework: { found: ['en_GB.lproj', 'en.lproj'], expected: MAC_LANGUAGES } },
    badNotices: [] as string[],
    gfde: { found: [...GFDE_FILES] as string[], launcherRuns: true }
  });
  const problems = (change: (p: ReturnType<typeof clean>) => void) => {
    const p = clean();
    change(p);
    return packageProblems(p).join('\n');
  };

  it('passes a package holding what the app runs', () => {
    expect(packageProblems(clean())).toEqual([]);
  });

  it('finds node_modules, at any depth', () => {
    expect(problems((p) => p.files.push('node_modules/exceljs/excel.js'))).toContain('node_modules is back');
    expect(problems((p) => p.files.push('electron/node_modules/a/index.js'))).toContain('node_modules is back');
  });

  it('finds a second CAD engine', () => {
    expect(problems((p) => p.files.push('dist/assets/gfde_cad_reader_bg-abc.wasm'))).toContain('dist/assets/gfde_cad_reader_bg-abc.wasm');
  });

  it('finds a missing file the app needs', () => {
    expect(problems((p) => { p.files = p.files.filter((f) => f !== 'branding.json'); })).toContain('branding.json is missing from app.asar');
    expect(problems((p) => { p.files = p.files.filter((f) => f !== 'dist-electron/exceljs.cjs'); })).toContain('dist-electron/exceljs.cjs is missing');
    expect(problems((p) => { p.files = p.files.filter((f) => f !== 'electron/cad/gfde_cad_reader_bg.wasm'); })).toContain('gfde_cad_reader_bg.wasm is missing');
    expect(problems((p) => { p.files = p.files.filter((f) => f !== 'dist/third-party-licences.md'); })).toContain('dist/third-party-licences.md is missing');
  });

  it('finds other languages back, and the English file gone', () => {
    expect(problems((p) => p.languages.locales.found.push('de.pak'))).toContain('locales should hold only en-GB.pak, en-US.pak');
    expect(problems((p) => { p.languages.locales.found = []; })).toContain('holds 0 files');
    expect(problems((p) => p.languages.framework.found.push('en_FEMININE.lproj'))).toContain('framework should hold only');
  });

  it('finds the gfde command gone, or its launcher not marked as a program', () => {
    expect(problems((p) => { p.gfde.found = []; }).split('\n')).toHaveLength(GFDE_FILES.length);
    expect(problems((p) => { p.gfde.found = p.gfde.found.filter((f) => f !== 'gfde.mjs'); })).toContain('resources/gfde/gfde.mjs is missing: the installed app would be without its gfde command and MCP server');
    expect(problems((p) => { p.gfde.launcherRuns = false; })).toContain('resources/gfde/gfde is not marked as a program that can be run');
  });

  it('finds a licence text gone', () => {
    expect(problems((p) => p.badNotices.push('LICENSES.chromium.html.gz'))).toContain('The licence text LICENSES.chromium.html.gz is missing or unreadable');
  });

  it('finds an app.asar that has grown', () => {
    expect(problems((p) => { p.asarMb = MAX_ASAR_MB + 1; })).toContain('above the');
  });

  it('reads the file list from the header of an app.asar', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gfde-asar-'));
    try {
      const json = Buffer.from(JSON.stringify({ files: { 'package.json': { size: 1, offset: '0' }, electron: { files: { 'main.cjs': { size: 1, offset: '1' }, cad: { files: { 'a.wasm': { size: 1, offset: '2' } } } } } } }));
      const head = Buffer.alloc(16);
      head.writeUInt32LE(4, 0);
      head.writeUInt32LE(json.length + 8, 4);
      head.writeUInt32LE(json.length + 4, 8);
      head.writeUInt32LE(json.length, 12);
      writeFileSync(join(dir, 'app.asar'), Buffer.concat([head, json]));
      expect(asarFiles(join(dir, 'app.asar'))).toEqual(['package.json', 'electron/main.cjs', 'electron/cad/a.wasm']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
