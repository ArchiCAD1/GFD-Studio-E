const fs = require('node:fs');
const path = require('node:path');
const safeFs = require('./safeFs.cjs');
const branding = require('../branding.json');

const TRIAL_DAYS = branding.trialDays;
const DAY_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const STATE_VERSION = 1;

function newTrial(now = Date.now()) {
  return { version: STATE_VERSION, startedAt: now, expiresAt: now + TRIAL_DAYS * DAY_MS, lastSeenAt: now };
}

function validState(value) {
  return !!value && value.version === STATE_VERSION
    && Number.isSafeInteger(value.startedAt)
    && Number.isSafeInteger(value.expiresAt)
    && Number.isSafeInteger(value.lastSeenAt)
    && value.expiresAt === value.startedAt + TRIAL_DAYS * DAY_MS
    && value.lastSeenAt >= value.startedAt;
}

function evaluate(state, now = Date.now()) {
  if (!validState(state)) return { expired: true, reason: 'invalid-state' };
  if (now + CLOCK_SKEW_MS < state.lastSeenAt) return { expired: true, reason: 'clock-rollback', expiresAt: state.expiresAt };
  if (now >= state.expiresAt) return { expired: true, reason: 'trial-ended', expiresAt: state.expiresAt };
  const next = { ...state, lastSeenAt: Math.max(now, state.lastSeenAt) };
  return { expired: false, state: next, daysRemaining: Math.ceil((state.expiresAt - now) / DAY_MS) };
}

function decode(buffer, storage) {
  const text = buffer.toString('utf8');
  if (text.startsWith('enc1:')) {
    if (!storage?.isEncryptionAvailable?.()) throw new Error('Secure trial storage is unavailable.');
    return JSON.parse(storage.decryptString(Buffer.from(text.slice(5), 'base64')));
  }
  if (text.startsWith('plain1:')) return JSON.parse(text.slice(7));
  throw new Error('Trial state format is not recognized.');
}

function encode(state, storage) {
  const text = JSON.stringify(state);
  if (storage?.isEncryptionAvailable?.()) return Buffer.from(`enc1:${storage.encryptString(text).toString('base64')}`);
  // Linux CI and developer builds may not have a desktop keyring. macOS and Windows use their OS-backed store.
  return Buffer.from(`plain1:${text}`);
}

function saveState(file, state, storage) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  safeFs.replaceFile(file, encode(state, storage), { mode: 'private' });
}

/** Starts a 90-day trial on first launch, persists an OS-encrypted timestamp where available, and fails closed on tampering or clock rollback. */
function loadOrStart(file, storage, now = Date.now()) {
  let state;
  if (fs.existsSync(file)) {
    try { state = decode(safeFs.readFileNoFollow(file, { what: 'trial state', max: 4096 }).buffer, storage); }
    catch { return { expired: true, reason: 'invalid-state' }; }
  } else {
    state = newTrial(now);
  }
  const result = evaluate(state, now);
  if (!result.expired) saveState(file, result.state, storage);
  else if (!fs.existsSync(file)) saveState(file, state, storage);
  return result;
}

module.exports = { CLOCK_SKEW_MS, DAY_MS, TRIAL_DAYS, evaluate, loadOrStart, newTrial, validState };
