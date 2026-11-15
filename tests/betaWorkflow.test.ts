import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const beta = readFileSync('.github/workflows/beta-release.yml', 'utf8');
const pages = readFileSync('.github/workflows/pages.yml', 'utf8');

describe('beta release workflow trust boundary', () => {
  it('publishes only after successful same-repository main CI or a verified main dispatch', () => {
    expect(beta).toContain('workflows: [CI]');
    expect(beta).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(beta).toContain("github.event.workflow_run.event == 'push'");
    expect(beta).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(beta).toContain('github.event.workflow_run.head_repository.full_name == github.repository');
    expect(beta).toContain("github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'");
    expect(beta).toContain('gh run list');
    expect(beta).not.toContain('pull_request_target');
  });

  it('checks out the exact tested commit and limits write permission to publishing', () => {
    expect(beta.match(/ref: \$\{\{ needs\.prepare\.outputs\.source_sha \}\}/g)).toHaveLength(3);
    expect(beta).toMatch(/permissions:\n {2}actions: read\n {2}contents: read/);
    expect(beta).toMatch(/publish:[\s\S]*?permissions:\n {6}actions: read\n {6}contents: write/);
    expect(beta.match(/persist-credentials: false/g)?.length).toBeGreaterThanOrEqual(4);
    expect(beta).not.toMatch(/secrets\.|contents: write[\s\S]*?windows:/);
  });

  it('uses native target runners, validates unpacked apps and uploads only installers', () => {
    expect(beta).toContain('runs-on: windows-latest');
    expect(beta).toContain('runs-on: macos-15');
    expect(beta).toContain('node scripts/check-package.mjs release/win-unpacked');
    expect(beta).toContain('node scripts/check-package.mjs "release/mac-arm64/LV Design Studio.app"');
    expect(beta).toContain('--config.mac.identity=null');
    expect(beta).toContain("CSC_IDENTITY_AUTO_DISCOVERY: 'false'");
    expect(beta).toContain("Get-AuthenticodeSignature $installer");
    expect(beta).toContain('codesign --verify --deep --strict');
    expect(beta.match(/npm version .*--ignore-scripts/g)).toHaveLength(2);
    expect(beta).not.toMatch(/path: release\/?\s*$/m);
  });

  it('uses only official GitHub actions and the GitHub CLI for release publication', () => {
    const actions = [...beta.matchAll(/^\s*- uses:\s*(\S+)/gm)].map((match) => match[1]);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((action) => action.startsWith('actions/'))).toBe(true);
    expect(beta).toContain('gh release create');
    expect(beta).not.toMatch(/softprops|release-action|curl .*upload/i);
  });
});

describe('Pages beta synchronization', () => {
  it('rebuilds after beta publication and resolves beta metadata at build time', () => {
    expect(pages).toContain('workflows: [Beta release]');
    expect(pages).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(pages).toContain('github.event.workflow_run.head_repository.full_name == github.repository');
    expect(pages).toContain('node scripts/beta-release.mjs select');
    expect(pages).toContain('node scripts/public-site.mjs build');
    expect(pages).toContain('gh release download');
    expect(pages).toContain('cancel-in-progress: false');
  });

  it('keeps release access read-only and Pages deployment narrowly permissioned', () => {
    expect(pages).toMatch(/permissions:\n {2}contents: read\n {2}pages: write\n {2}id-token: write/);
    expect(pages).toContain('persist-credentials: false');
    expect(pages).not.toMatch(/secrets\.|contents: write/);
  });
});
