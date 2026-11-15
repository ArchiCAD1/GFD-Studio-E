#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const BETA_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-beta\.(0|[1-9]\d*)$/;
const COMMIT = /^[0-9a-f]{40}$/;

export function betaParts(version) {
  const match = BETA_VERSION.exec(version);
  return match ? match.slice(1).map(Number) : undefined;
}

export function compareBetaVersions(left, right) {
  const a = betaParts(left);
  const b = betaParts(right);
  if (!a || !b) throw new Error('Invalid beta version');
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

export function deriveBetaVersion(packageVersion, runNumber) {
  const match = STABLE_VERSION.exec(packageVersion);
  if (!match) throw new Error('package.json version must be a stable SemVer');
  if (!/^[1-9]\d*$/.test(String(runNumber))) throw new Error('GitHub run number must be a positive integer');
  return `${Number(match[1])}.${Number(match[2]) + 1}.0-beta.${Number(runNumber)}`;
}

export function assetNames(version) {
  if (!betaParts(version)) throw new Error('Invalid beta version');
  return {
    windows: `LV-Design-Studio-${version}-win-x64.exe`,
    macos: `LV-Design-Studio-${version}-mac-arm64.dmg`,
    checksums: 'SHA256SUMS.txt'
  };
}

export function selectLatestBeta(releases) {
  if (!Array.isArray(releases)) throw new Error('Release list is invalid');
  return releases
    .filter((release) => release && release.isPrerelease === true && typeof release.tagName === 'string' && betaParts(release.tagName.slice(1)))
    .sort((a, b) => compareBetaVersions(b.tagName.slice(1), a.tagName.slice(1)))[0];
}

export function hasBetaForCommit(releases, commit) {
  if (!Array.isArray(releases)) throw new Error('Release list is invalid');
  if (!COMMIT.test(commit)) throw new Error('Release commit is invalid');
  return releases.some((release) => {
    if (!release || typeof release !== 'object') return false;
    const tag = release.tagName ?? release.tag_name;
    const prerelease = release.isPrerelease ?? release.prerelease;
    const target = release.targetCommitish ?? release.target_commitish;
    return prerelease === true
      && typeof tag === 'string'
      && tag.startsWith('v')
      && !!betaParts(tag.slice(1))
      && target === commit;
  });
}

export function parseChecksums(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 8_192) throw new Error('Checksum file is invalid');
  const entries = new Map();
  for (const line of text.trim().split('\n')) {
    const match = /^([0-9a-f]{64}) {2}([A-Za-z0-9._-]+)$/.exec(line.trimEnd());
    if (!match || entries.has(match[2])) throw new Error('Checksum line is invalid');
    entries.set(match[2], match[1]);
  }
  return entries;
}

export function releaseMetadata(release, checksumText) {
  if (!release || release.isPrerelease !== true || typeof release.tagName !== 'string' || !release.tagName.startsWith('v')) throw new Error('Release is not a prerelease');
  const version = release.tagName.slice(1);
  const names = assetNames(version);
  if (typeof release.publishedAt !== 'string' || !Number.isFinite(Date.parse(release.publishedAt))) throw new Error('Release date is invalid');
  if (typeof release.targetCommitish !== 'string' || !COMMIT.test(release.targetCommitish)) throw new Error('Release commit is invalid');
  if (!Array.isArray(release.assets)) throw new Error('Release assets are invalid');
  const available = new Set(release.assets.map((asset) => asset && asset.name).filter((name) => typeof name === 'string'));
  for (const name of Object.values(names)) if (!available.has(name)) throw new Error(`Release asset is missing: ${name}`);
  const checksums = parseChecksums(checksumText);
  for (const name of [names.windows, names.macos]) if (!checksums.has(name)) throw new Error(`Checksum is missing: ${name}`);
  if (checksums.size !== 2) throw new Error('Checksum file must list only the installers');
  return {
    version,
    tag: release.tagName,
    publishedAt: new Date(release.publishedAt).toISOString(),
    sourceCommit: release.targetCommitish,
    windows: { name: names.windows, sha256: checksums.get(names.windows) },
    macos: { name: names.macos, sha256: checksums.get(names.macos) }
  };
}

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function writeChecksums(directory, version, output) {
  const names = assetNames(version);
  const lines = [];
  for (const name of [names.windows, names.macos]) lines.push(`${await sha256(join(directory, name))}  ${name}`);
  writeFileSync(output, `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o644 });
}

export function releaseNotes(version, commit) {
  if (!betaParts(version) || !COMMIT.test(commit)) throw new Error('Release version or commit is invalid');
  return `# LV Design Studio ${version} — unsigned beta

This prerelease was built from commit \`${commit}\` after the repository's CI completed successfully.

## Before installing

- This is an unsigned active-development build. macOS Gatekeeper and Windows SmartScreen or unknown-publisher warnings are expected.
- Keep those operating-system protections enabled. This project does not provide instructions to bypass them.
- Back up LV Design Studio project files before testing.
- Do not use this beta for production issue work.

## Packages

- Windows x64: normal NSIS installer (\`.exe\`).
- Apple-silicon macOS: disk image (\`.dmg\`).
- \`SHA256SUMS.txt\` contains the SHA-256 checksum for each installer.

Installed beta builds only notify when a newer beta is available. They open the trusted project download page after confirmation; they never download, execute, replace, or install an update automatically.
`;
}

async function main(args) {
  const [command, ...rest] = args;
  if (command === 'version' && rest.length === 2) {
    const pkg = JSON.parse(readFileSync(rest[0], 'utf8'));
    process.stdout.write(`${deriveBetaVersion(pkg.version, rest[1])}\n`);
    return;
  }
  if (command === 'checksums' && rest.length === 3) {
    await writeChecksums(rest[0], rest[1], rest[2]);
    return;
  }
  if (command === 'notes' && rest.length === 3) {
    writeFileSync(rest[2], releaseNotes(rest[0], rest[1]), { encoding: 'utf8', mode: 0o644 });
    return;
  }
  if (command === 'select' && rest.length === 1) {
    const release = selectLatestBeta(JSON.parse(readFileSync(rest[0], 'utf8')));
    if (release) process.stdout.write(`${release.tagName}\n`);
    return;
  }
  if (command === 'published' && rest.length === 2) {
    process.stdout.write(`${hasBetaForCommit(JSON.parse(readFileSync(rest[0], 'utf8')), rest[1])}\n`);
    return;
  }
  throw new Error(`Usage: ${basename(process.argv[1])} version <package.json> <run-number> | checksums <directory> <version> <output> | notes <version> <commit> <output> | select <releases.json> | published <releases.json> <commit>`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
