import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Manifest = { schemaVersion: 1; channel: 'beta'; version: string; publishedAt: string; sourceCommit: string };
type UpdateModule = {
  BETA_DOWNLOAD_URL: string;
  BETA_MANIFEST_URL: string;
  MANIFEST_BYTES: number;
  betaChannelEnabled: (packaged: boolean, version: string) => boolean;
  compareBetaVersions: (a: string, b: string) => number;
  fetchManifest: (fetcher: typeof fetch, options?: { timeoutMs?: number; maxBytes?: number }) => Promise<Manifest>;
  parseManifest: (text: string) => Manifest;
  shouldOfferUpdate: (current: string, manifest: Manifest, prompted: Set<string>) => boolean;
  startBetaUpdateChecks: (options: Record<string, unknown>) => { check: () => Promise<void>; stop: () => void } | undefined;
};

const updates = createRequire(import.meta.url)('../../electron/betaUpdate.cjs') as UpdateModule;
const manifest = (version = '2.144.0-beta.12'): Manifest => ({
  schemaVersion: 1,
  channel: 'beta',
  version,
  publishedAt: '2026-11-14T08:30:00Z',
  sourceCommit: 'a'.repeat(40)
});
const response = (value: unknown, init: ResponseInit = {}) => {
  const out = new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json', ...init.headers } });
  Object.defineProperty(out, 'url', { value: updates.BETA_MANIFEST_URL, configurable: true });
  return out;
};

afterEach(() => vi.useRealTimers());

describe('beta update manifest', () => {
  it('accepts only the versioned, data-only schema', () => {
    expect(updates.parseManifest(JSON.stringify(manifest()))).toEqual(manifest());
    for (const value of [
      { ...manifest(), schemaVersion: 2 },
      { ...manifest(), channel: 'stable' },
      { ...manifest(), version: '2.144.0' },
      { ...manifest(), sourceCommit: 'main' },
      { ...manifest(), downloadUrl: 'https://example.test/app.exe' }
    ]) expect(() => updates.parseManifest(JSON.stringify(value))).toThrow();
  });

  it('uses SemVer ordering for monotonically numbered beta builds', () => {
    expect(updates.compareBetaVersions('2.144.0-beta.10', '2.144.0-beta.9')).toBeGreaterThan(0);
    expect(updates.compareBetaVersions('2.145.0-beta.1', '2.144.0-beta.999')).toBeGreaterThan(0);
    expect(updates.compareBetaVersions('2.144.0-beta.9', '2.144.0-beta.9')).toBe(0);
    expect(() => updates.compareBetaVersions('2.144.0', '2.144.0-beta.1')).toThrow();
  });

  it('enables network checks only for packaged beta builds', () => {
    expect(updates.betaChannelEnabled(true, '2.144.0-beta.1')).toBe(true);
    expect(updates.betaChannelEnabled(false, '2.144.0-beta.1')).toBe(false);
    expect(updates.betaChannelEnabled(true, '2.144.0')).toBe(false);
  });

  it('requests only the compiled-in HTTPS manifest without following redirects', async () => {
    const fetcher = vi.fn(async () => response(manifest())) as unknown as typeof fetch;
    await expect(updates.fetchManifest(fetcher)).resolves.toEqual(manifest());
    expect(fetcher).toHaveBeenCalledWith(updates.BETA_MANIFEST_URL, expect.objectContaining({
      method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer'
    }));
    expect(updates.BETA_MANIFEST_URL).toBe('https://pdhruv15.github.io/LV-Design-Suit/download/beta.json');
  });

  it('rejects a redirected origin, wrong content type and oversized response', async () => {
    const redirected = response(manifest());
    Object.defineProperty(redirected, 'url', { value: 'https://example.test/beta.json' });
    await expect(updates.fetchManifest(async () => redirected as Response)).rejects.toThrow('response is invalid');
    const html = response(manifest(), { headers: { 'content-type': 'text/html' } });
    await expect(updates.fetchManifest(async () => html as Response)).rejects.toThrow('content type');
    const large = response(manifest(), { headers: { 'content-length': String(updates.MANIFEST_BYTES + 1) } });
    await expect(updates.fetchManifest(async () => large as Response)).rejects.toThrow('too large');
    const streamed = response({ padding: 'x'.repeat(200) });
    await expect(updates.fetchManifest(async () => streamed as Response, { maxBytes: 32 })).rejects.toThrow('too large');
  });

  it('times out a stalled request', async () => {
    vi.useFakeTimers();
    const pending = updates.fetchManifest(() => new Promise<Response>(() => {}), { timeoutMs: 25 });
    const rejected = expect(pending).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(25);
    await rejected;
  });
});

describe('beta notification decision', () => {
  it('offers only a newer version that was not already prompted', () => {
    const prompted = new Set<string>();
    expect(updates.shouldOfferUpdate('2.144.0-beta.9', manifest('2.144.0-beta.10'), prompted)).toBe(true);
    prompted.add('2.144.0-beta.10');
    expect(updates.shouldOfferUpdate('2.144.0-beta.9', manifest('2.144.0-beta.10'), prompted)).toBe(false);
    expect(updates.shouldOfferUpdate('2.144.0-beta.10', manifest('2.144.0-beta.9'), new Set())).toBe(false);
  });

  it('opens only the hard-coded download page and prompts once per session', async () => {
    const showMessageBox = vi.fn(async () => ({ response: 0 }));
    const openExternal = vi.fn(async () => undefined);
    const fetcher = vi.fn(async () => response(manifest())) as unknown as typeof fetch;
    const scheduler = updates.startBetaUpdateChecks({
      isPackaged: true,
      currentVersion: '2.144.0-beta.1',
      getWindow: () => ({ isDestroyed: () => false }),
      showMessageBox,
      openExternal,
      fetchImpl: fetcher,
      startupDelayMs: 60_000,
      intervalMs: 120_000
    });
    expect(scheduler).toBeDefined();
    await scheduler?.check();
    await scheduler?.check();
    scheduler?.stop();
    expect(showMessageBox).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith(updates.BETA_DOWNLOAD_URL);
    expect(updates.BETA_DOWNLOAD_URL).toBe('https://pdhruv15.github.io/LV-Design-Suit/download/');
  });

  it('does not schedule anything for development or stable builds', () => {
    const fetcher = vi.fn();
    expect(updates.startBetaUpdateChecks({ isPackaged: false, currentVersion: '2.144.0-beta.1', fetchImpl: fetcher })).toBeUndefined();
    expect(updates.startBetaUpdateChecks({ isPackaged: true, currentVersion: '2.144.0', fetchImpl: fetcher })).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
