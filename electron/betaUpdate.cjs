// Notification-only beta updates. This module never downloads or runs an installer. It is kept free of
// Electron imports so the trust boundary, manifest parser and network limits can be unit tested.

const BETA_MANIFEST_URL = 'https://pdhruv15.github.io/LV-Design-Suit/download/beta.json';
const BETA_DOWNLOAD_URL = 'https://pdhruv15.github.io/LV-Design-Suit/download/';
const MANIFEST_BYTES = 16 * 1024;
const REQUEST_TIMEOUT_MS = 5_000;
const STARTUP_DELAY_MS = 10_000;
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1_000;
const BETA_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-beta\.(0|[1-9]\d*)$/;

function parseBetaVersion(value) {
  if (typeof value !== 'string') return undefined;
  const match = BETA_VERSION.exec(value);
  if (!match) return undefined;
  return match.slice(1).map(Number);
}

function compareBetaVersions(left, right) {
  const a = parseBetaVersion(left);
  const b = parseBetaVersion(right);
  if (!a || !b) throw new Error('Invalid beta version');
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

function betaChannelEnabled(isPackaged, version) {
  return isPackaged === true && !!parseBetaVersion(version);
}

function parseManifest(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MANIFEST_BYTES) throw new Error('Manifest is too large');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('Manifest is not JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Manifest is not an object');
  const keys = Object.keys(value).sort();
  const expected = ['channel', 'publishedAt', 'schemaVersion', 'sourceCommit', 'version'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) throw new Error('Manifest fields are invalid');
  if (value.schemaVersion !== 1 || value.channel !== 'beta' || !parseBetaVersion(value.version)) throw new Error('Manifest channel or version is invalid');
  if (typeof value.publishedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value.publishedAt) || !Number.isFinite(Date.parse(value.publishedAt))) throw new Error('Manifest date is invalid');
  if (typeof value.sourceCommit !== 'string' || !/^[0-9a-f]{40}$/.test(value.sourceCommit)) throw new Error('Manifest commit is invalid');
  return value;
}

async function responseTextLimited(response, maxBytes = MANIFEST_BYTES) {
  if (!response || response.status !== 200 || response.url !== BETA_MANIFEST_URL) throw new Error('Manifest response is invalid');
  const type = response.headers && response.headers.get('content-type');
  if (typeof type !== 'string' || !/^application\/json(?:\s*;|$)/i.test(type)) throw new Error('Manifest content type is invalid');
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new Error('Manifest is too large');
  if (!response.body || typeof response.body.getReader !== 'function') throw new Error('Manifest response cannot be bounded');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error('Manifest is too large');
      chunks.push(value);
    }
  } catch (error) {
    try { await reader.cancel(); } catch { /* already closed */ }
    throw error;
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

async function fetchManifest(fetchImpl = globalThis.fetch, { timeoutMs = REQUEST_TIMEOUT_MS, maxBytes = MANIFEST_BYTES } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable');
  const controller = new AbortController();
  let timer;
  const request = (async () => {
    const response = await fetchImpl(BETA_MANIFEST_URL, {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: controller.signal
    });
    return parseManifest(await responseTextLimited(response, maxBytes));
  })();
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Manifest request timed out'));
    }, timeoutMs);
  });
  try { return await Promise.race([request, timeout]); } finally { clearTimeout(timer); }
}

function shouldOfferUpdate(currentVersion, manifest, promptedVersions) {
  return !!parseBetaVersion(currentVersion)
    && !!manifest
    && !promptedVersions.has(manifest.version)
    && compareBetaVersions(manifest.version, currentVersion) > 0;
}

function startBetaUpdateChecks({
  isPackaged,
  currentVersion,
  getWindow,
  showMessageBox,
  openExternal,
  fetchImpl = globalThis.fetch,
  startupDelayMs = STARTUP_DELAY_MS,
  intervalMs = CHECK_INTERVAL_MS
}) {
  if (!betaChannelEnabled(isPackaged, currentVersion)) return undefined;
  const promptedVersions = new Set();
  let checking = false;
  let stopped = false;
  const check = async () => {
    if (checking || stopped) return;
    checking = true;
    try {
      const manifest = await fetchManifest(fetchImpl);
      if (!shouldOfferUpdate(currentVersion, manifest, promptedVersions)) return;
      const window = getWindow();
      if (!window || (typeof window.isDestroyed === 'function' && window.isDestroyed())) return;
      promptedVersions.add(manifest.version);
      const result = await showMessageBox(window, {
        type: 'info',
        buttons: ['Open beta download page', 'Later'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
        title: 'LV Design Studio beta update',
        message: 'A newer LV Design Studio beta is available.',
        detail: `Version ${manifest.version} is available. The app will open the trusted beta download page; you choose whether to download and run the unsigned installer.`
      });
      if (result && result.response === 0) await openExternal(BETA_DOWNLOAD_URL);
    } catch { /* Update checks are optional and must never disturb offline work. */ }
    finally { checking = false; }
  };
  const first = setTimeout(check, startupDelayMs);
  const interval = setInterval(check, intervalMs);
  if (typeof first.unref === 'function') first.unref();
  if (typeof interval.unref === 'function') interval.unref();
  return {
    check,
    stop() {
      stopped = true;
      clearTimeout(first);
      clearInterval(interval);
    }
  };
}

module.exports = {
  BETA_DOWNLOAD_URL,
  BETA_MANIFEST_URL,
  CHECK_INTERVAL_MS,
  MANIFEST_BYTES,
  REQUEST_TIMEOUT_MS,
  betaChannelEnabled,
  compareBetaVersions,
  fetchManifest,
  parseBetaVersion,
  parseManifest,
  responseTextLimited,
  shouldOfferUpdate,
  startBetaUpdateChecks
};
