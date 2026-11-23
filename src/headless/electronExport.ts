import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExportJob } from './rendererExport';

/** Exports that need the app's renderer (drawing sheets as DXF, reports as PDF) run in Electron:
 * electron/headlessExport.cjs, started from the app's source folder (Electron from node_modules and the
 * built app in dist) or through the installed app. The files come back here; nothing is written by Electron. */

export interface Renderer { command: string; args: string[]; where: string }
export interface RendererFile { name: string; about: string; data: Uint8Array }

/** The app folder this gfde belongs to (dist-cli/gfde.mjs or src/headless/*.ts → the folder with package.json). */
function appRoot(): string | undefined {
  let dir: string;
  try { dir = path.dirname(fileURLToPath(import.meta.url)); } catch { return undefined; }
  for (let i = 0; i < 4; i++, dir = path.dirname(dir)) {
    try { if (JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')).name === 'gfd-studio-e') return dir; } catch { /* up */ }
  }
  return undefined;
}

/** Installed app executables, per platform. On Windows the installer's own folder for one user is
 * Programs\GFD Studio E (the installer lets the user choose the folder; a one-click installer would use the package name). */
export function installedApps(platform = process.platform, env: Record<string, string | undefined> = process.env, home = os.homedir()): string[] {
  if (platform === 'darwin') return ['/Applications/GFD Studio E.app', path.join(home, 'Applications', 'GFD Studio E.app')].map((a) => path.join(a, 'Contents', 'MacOS', 'GFD Studio E'));
  if (platform === 'win32') {
    const programs = path.join(env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'Programs');
    return [path.join(programs, 'GFD Studio E', 'GFD Studio E.exe'), path.join(programs, 'gfd-studio-e', 'GFD Studio E.exe'), path.join(env.ProgramFiles ?? 'C:\\Program Files', 'GFD Studio E', 'GFD Studio E.exe')];
  }
  return [];
}

/** Whether an installed app's app.asar has the headless export (older versions would open the app window instead).
 * Run by the app as Node, fs shows an .asar as a folder; that is switched off while its header is read. */
export function asarHasHeadlessExport(asar: string): boolean {
  const proc = process as { noAsar?: boolean };
  const inElectron = !!process.versions.electron, before = proc.noAsar;
  if (inElectron) proc.noAsar = true;
  try {
    const fd = fs.openSync(asar, 'r');
    try {
      // Chromium pickle: [4][header size][payload size][string length][JSON header]
      const head = Buffer.alloc(16);
      fs.readSync(fd, head, 0, 16, 0);
      const len = head.readUInt32LE(12);
      if (len <= 0 || len > 64 * 1024 * 1024) return false;
      const json = Buffer.alloc(len);
      fs.readSync(fd, json, 0, len, 16);
      const header = JSON.parse(json.toString('utf-8')) as { files?: Record<string, { files?: Record<string, unknown> }> };
      return !!header.files?.electron?.files?.['headlessExport.cjs'] && !!header.files?.dist;
    } finally { fs.closeSync(fd); }
  } catch { return false; } finally { if (inElectron) proc.noAsar = before; }
}

const asarOf = (exe: string) => (process.platform === 'darwin' ? path.join(exe, '..', '..', 'Resources', 'app.asar') : path.join(path.dirname(exe), 'resources', 'app.asar'));

/** The installed app this gfde runs inside (its resources/gfde, with the app as the Node runtime), wherever
 * it was installed: the same app makes the export. */
export function hostApp(execPath = process.execPath, electron = !!process.versions.electron): string | undefined {
  return electron && asarHasHeadlessExport(asarOf(execPath)) ? execPath : undefined;
}

/** How to run the renderer export, or why it cannot run here. GFDE_ELECTRON: an Electron executable to use with this app folder. */
export function findRenderer(): Renderer | { missing: string } {
  const root = appRoot();
  const script = root && path.join(root, 'electron', 'headlessExport.cjs');
  const built = root && fs.existsSync(path.join(root, 'dist', 'index.html'));
  if (root && script && fs.existsSync(script)) {
    let electron = process.env.GFDE_ELECTRON ?? process.env.LVDS_ELECTRON;
    if (!electron) { try { electron = String(createRequire(path.join(root, 'package.json'))('electron')); } catch { /* not installed */ } }
    if (electron && fs.existsSync(electron)) {
      if (built) return { command: electron, args: [script, '--gfde-headless-export'], where: `Electron in ${root}` };
      return { missing: `the app is not built in ${root}: run "npm run build" first` };
    }
  }
  const app = hostApp() ?? installedApps().find((exe) => fs.existsSync(exe) && asarHasHeadlessExport(asarOf(exe)));
  if (app) return { command: app, args: ['--gfde-headless-export'], where: `the installed app (${app})` };
  return { missing: 'it needs Electron: run gfde from the GFD Studio E source folder after "npm install" and "npm run build", or install a version of GFD Studio E that has this export' };
}

/** Runs one job in Electron and returns its files. */
export async function runInRenderer(job: ExportJob, renderer: Renderer, timeoutMs = 11 * 60 * 1000): Promise<RendererFile[]> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gfde-export-'));
  const jobFile = path.join(tmp, 'job.json'), resultFile = path.join(tmp, 'result.json');
  try {
    fs.writeFileSync(jobFile, JSON.stringify(job));
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const { code, stderr } = await new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
      const child = spawn(renderer.command, [...renderer.args, jobFile, resultFile], { env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
      let err = '';
      child.stderr.on('data', (d) => { err = (err + String(d)).slice(-4000); });
      const timer = setTimeout(() => { child.kill(); }, timeoutMs);
      child.on('error', (e) => { clearTimeout(timer); reject(new Error(`Could not start ${renderer.where}: ${e.message}`)); });
      child.on('close', (c) => { clearTimeout(timer); resolve({ code: c, stderr: err }); });
    });
    let result: { ok: boolean; error?: string; files?: { name: string; about: string; base64: string }[] } | undefined;
    try { result = JSON.parse(fs.readFileSync(resultFile, 'utf-8')); } catch { /* no result */ }
    if (!result) throw new Error(`The export in ${renderer.where} stopped (exit ${code}) without a result.${stderr.trim() ? ` ${stderr.trim().split(/\r?\n/).slice(-3).join(' ')}` : ''}`);
    if (!result.ok) throw new Error(`The export in ${renderer.where} failed: ${result.error}`);
    return (result.files ?? []).map((f) => ({ name: f.name, about: f.about, data: new Uint8Array(Buffer.from(f.base64, 'base64')) }));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
