// electron-builder hook. Product notices are copied beside the CLI after packing so they also remain in app.asar:
// electron-builder excludes extraResources sources from app.asar even when files explicitly includes them.
// On Windows and Linux Electron's two licence texts stay beside the app; on a Mac electron-builder
// deletes them. This puts them inside the app, before it is signed, from the Electron download of the version being
// packaged. The Chromium list is gzipped: about 2 MB instead of 20 MB.

const { execFileSync } = require('node:child_process');
const { copyFileSync, mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { gzipSync } = require('node:zlib');

/** Writes the two texts into a Resources folder. read(name) gives a file of the Electron download. */
function writeNotices(resources, read) {
  writeFileSync(path.join(resources, 'LICENSE.electron.txt'), read('LICENSE'));
  writeFileSync(path.join(resources, 'LICENSES.chromium.html.gz'), gzipSync(read('LICENSES.chromium.html'), { level: 9 }));
}

/** A missing file stops the build: a package must not lose these without anyone noticing. */
async function afterPack({ electronPlatformName, appOutDir, arch, packager }) {
  const resources = electronPlatformName === 'darwin'
    ? path.join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(appOutDir, 'resources');
  for (const name of ['LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE.md', 'docs/provenance/README.md', 'docs/provenance/UPSTREAM-NOTICE.md']) {
    const destination = path.join(resources, 'gfde', name);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(path.join(packager.info.projectDir, name), destination);
  }
  if (electronPlatformName !== 'darwin') return;
  const { Arch } = require('electron-builder');
  const { downloadArtifact } = await import('@electron/get');
  const zip = await downloadArtifact({ version: packager.info.framework.version, artifactName: 'electron', platform: 'darwin', arch: Arch[arch] });
  const read = (name) => execFileSync('unzip', ['-p', zip, name], { maxBuffer: 64 * 1024 * 1024 });
  writeNotices(resources, read);
}

module.exports = { afterPack, writeNotices };
