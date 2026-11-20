#!/usr/bin/env node
/** Deterministic, offline screenshots for the modular user manual. */
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/manual/visuals.json'), 'utf8'));
const entry = path.join(root, 'dist/index.html');
const product = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

app.setName(product.productName);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('ozone-override-screen-size', `${manifest.viewport.width},${manifest.viewport.height}`);

app.setPath('userData', path.join(root, 'tmp/manual-capture/user-data'));
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');

let win;

async function capture(shot) {
  await win.loadFile(entry, { query: { manualCapture: '1', manualView: shot.view, manualBoard: shot.board } });
  await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const until = Date.now() + 15000;
    const check = async () => {
      const el = document.querySelector('[data-doc-id="${shot.readyTarget}"]');
      if (el && el.getBoundingClientRect().width > 20) {
        if (document.fonts?.ready) await document.fonts.ready;
        // Documentation-only overlays are suppressed without clicking controls.
        const captureStyle = document.createElement('style');
        captureStyle.textContent = '.web-banner,.modal-backdrop:has(.whats-new),.top>button[title^="Download"]{display:none!important}*{caret-color:transparent!important}';
        document.head.append(captureStyle);
        document.querySelectorAll('*').forEach((node) => {
          if (node.children.length === 0 && node.textContent?.trim().startsWith('Web version')) node.style.visibility = 'hidden';
        });
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      } else if (Date.now() > until) reject(new Error('Timed out waiting for ${shot.readyTarget}'));
      else setTimeout(check, 50);
    };
    check();
  })`);
  const metadata = await win.webContents.executeJavaScript(`(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const callouts = ${JSON.stringify(shot.callouts)}.map((item) => {
      const el = document.querySelector('[data-doc-id="' + item.target + '"]');
      if (!el) throw new Error('Missing manual target: ' + item.target);
      const r = el.getBoundingClientRect();
      return { ...item, rect: { x: r.x, y: r.y, width: r.width, height: r.height }, point: { x: (r.x + r.width / 2) / viewport.width, y: (r.y + r.height / 2) / viewport.height } };
    });
    return { schemaVersion: 1, shot: '${shot.id}', viewport, callouts };
  })()`);
  const imagePath = path.join(root, shot.image);
  const metadataPath = path.join(root, shot.metadata);
  fs.mkdirSync(path.dirname(imagePath), { recursive: true });
  fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
  const captured = await win.webContents.capturePage();
  const size = captured.getSize();
  if (size.width !== manifest.viewport.width || size.height !== manifest.viewport.height) throw new Error(`Capture viewport is ${size.width}x${size.height}, expected ${manifest.viewport.width}x${manifest.viewport.height}`);
  const screenshot = captured.toPNG();
  fs.writeFileSync(imagePath, screenshot);
  if (shot.productImage) {
    const productImage = path.join(root, shot.productImage);
    fs.mkdirSync(path.dirname(productImage), { recursive: true });
    fs.writeFileSync(productImage, screenshot);
  }
  metadata.productName = product.productName;
  metadata.appVersion = product.version;
  metadata.captureSource = 'offline documentation capture of committed demonstration data';
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  process.stdout.write(`Captured ${shot.id}: ${path.relative(root, imagePath)}\n`);
}

app.whenReady().then(async () => {
  try {
    if (!fs.existsSync(entry)) throw new Error('dist/index.html is missing; run npm run build first');
    const captureSession = session.fromPartition(`manual-capture-${process.pid}`, { cache: false });
    captureSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, done) => done({ cancel: true }));
    win = new BrowserWindow({
      show: false,
      width: manifest.viewport.width,
      height: manifest.viewport.height,
      useContentSize: true,
      backgroundColor: '#ffffff',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, offscreen: true, session: captureSession }
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    for (const shot of manifest.shots) await capture(shot);
  } catch (error) {
    console.error(error);
    if (win && !win.isDestroyed()) console.error(await win.webContents.executeJavaScript('document.body.innerText.slice(0, 3000)').catch(() => 'Renderer unavailable'));
    if (win && !win.isDestroyed()) win.destroy();
    app.exit(1);
    return;
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    app.quit();
  }
});
