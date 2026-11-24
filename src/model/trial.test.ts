import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const trial = require('../../electron/trial.cjs') as {
  DAY_MS: number;
  evaluate: (state: unknown, now?: number) => { expired: boolean; reason?: string; daysRemaining?: number };
  loadOrStart: (file: string, storage: unknown, now?: number) => { expired: boolean; reason?: string; daysRemaining?: number };
};

describe('90-day packaged beta trial', () => {
  const roots: string[] = [];
  const storage = {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) => Buffer.from(text),
    decryptString: (bytes: Buffer) => bytes.toString('utf8')
  };
  afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
  const trialFile = () => {
    const root = mkdtempSync(path.join(tmpdir(), 'gfde-trial-'));
    roots.push(root);
    return path.join(root, 'pilot-trial.bin');
  };

  it('starts on first launch, stores an encrypted private state and remains active for 90 days', () => {
    const file = trialFile(), started = Date.UTC(2026, 10, 23);
    const first = trial.loadOrStart(file, storage, started);
    expect(first).toMatchObject({ expired: false, daysRemaining: 90 });
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(file, 'utf8')).toMatch(/^enc1:/);
    expect(trial.loadOrStart(file, storage, started + 89 * trial.DAY_MS)).toMatchObject({ expired: false, daysRemaining: 1 });
    expect(trial.loadOrStart(file, storage, started + 90 * trial.DAY_MS)).toMatchObject({ expired: true, reason: 'trial-ended' });
  });

  it('locks if the system clock moves backwards or the saved trial state is damaged', () => {
    const started = Date.UTC(2026, 10, 23);
    expect(trial.evaluate({ version: 1, startedAt: started, expiresAt: started + 90 * trial.DAY_MS, lastSeenAt: started + trial.DAY_MS }, started)).toMatchObject({ expired: true, reason: 'clock-rollback' });
    const damaged = trialFile();
    writeFileSync(damaged, 'broken');
    expect(trial.loadOrStart(damaged, storage, started)).toMatchObject({ expired: true, reason: 'invalid-state' });
  });
});
