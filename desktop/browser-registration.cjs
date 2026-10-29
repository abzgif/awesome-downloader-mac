const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

// macOS native messaging manifest directories per browser.
const MANIFEST_DIRS = {
  Chrome: path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts'),
  Edge: path.join(os.homedir(), 'Library', 'Application Support', 'Microsoft Edge', 'NativeMessagingHosts'),
  Brave: path.join(os.homedir(), 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser', 'NativeMessagingHosts'),
  Opera: path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts'),
  Firefox: path.join(os.homedir(), 'Library', 'Application Support', 'Mozilla', 'NativeMessagingHosts')
};

// macOS profile directories per browser.
const PROFILE_DIRS = {
  Chrome: path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome'),
  Edge: path.join(os.homedir(), 'Library', 'Application Support', 'Microsoft Edge'),
  Brave: path.join(os.homedir(), 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser'),
  Opera: path.join(os.homedir(), 'Library', 'Application Support', 'com.operasoftware.Opera')
};

const BROWSERS = {
  Chrome: { manifestKey: 'Chrome' },
  Edge: { manifestKey: 'Edge' },
  Brave: { manifestKey: 'Brave' },
  Opera: { manifestKey: 'Opera' },
  Firefox: { manifestKey: 'Firefox', firefox: true }
};

function browserSpec(browser) {
  const spec = BROWSERS[browser];
  if (!spec) throw new Error('Choose Chrome, Edge, Brave, Opera, or Firefox.');
  return spec;
}

function computeExtensionId(folderPath) {
  const hash = crypto.createHash('sha256').update(folderPath, 'utf8').digest('hex').slice(0, 32);
  let id = '';
  for (let i = 0; i < hash.length; i++) {
    id += String.fromCharCode('a'.charCodeAt(0) + parseInt(hash[i], 16));
  }
  return id;
}

async function registerBrowser({ browser, extensionId }, { dataDirectory, integrationRoot }) {
  const spec = browserSpec(browser);
  if (typeof extensionId !== 'string' || !(spec.firefox ? /^[A-Za-z0-9@._{}-]{1,128}$/ : /^[a-p]{32}$/).test(extensionId)) throw new Error("Copy the extension ID from your browser's extensions page.");
  const host = 'com.awesome.downloader';
  const nativeHostPath = path.join(integrationRoot, 'integration', 'native-host.sh');
  const manifestDir = MANIFEST_DIRS[spec.manifestKey];
  const manifestPath = path.join(manifestDir, `${host}.json`);
  const manifest = { name: host, description: 'Awesome Downloader browser bridge', path: nativeHostPath, type: 'stdio' };
  if (spec.firefox) manifest.allowed_extensions = [extensionId];
  else manifest.allowed_origins = [`chrome-extension://${extensionId}/`];

  await fs.access(nativeHostPath);
  await fs.mkdir(manifestDir, { recursive: true });
  let previous;
  try { previous = await fs.readFile(manifestPath, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (previous && !spec.firefox) {
    try {
      const old = JSON.parse(previous);
      manifest.allowed_origins = [...new Set([...(old.allowed_origins || []), ...manifest.allowed_origins])].filter(value => /^chrome-extension:\/\/[a-p]{32}\/$/.test(value));
    } catch {}
  }
  const content = JSON.stringify(manifest, null, 2);
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  if (previous && previous !== content) await fs.writeFile(`${manifestPath}.${stamp}.bak`, previous);
  if (previous !== content) await fs.writeFile(manifestPath, content, 'utf8');

  let extensionPath = path.join(integrationRoot, 'extension');
  if (spec.firefox) {
    const folder = path.join(dataDirectory, 'NativeMessaging');
    await fs.mkdir(folder, { recursive: true });
    extensionPath = path.join(folder, 'firefox-extension');
    await fs.cp(path.join(integrationRoot, 'extension'), extensionPath, { recursive: true });
    await fs.copyFile(path.join(extensionPath, 'manifest.firefox.json'), path.join(extensionPath, 'manifest.json'));
  }
  return { ok: true, manifestPath, extensionPath };
}

// Read extension registrations or auto-register deterministic extension IDs
async function connectInstalledBrowsers({ dataDirectory, integrationRoot }) {
  const results = [];
  const host = 'com.awesome.downloader';
  const nativeHostPath = path.join(integrationRoot, 'integration', 'native-host.sh');

  for (const [browser, profileRoot] of Object.entries(PROFILE_DIRS)) {
    const ids = new Set();
    const possiblePaths = [
      path.join(integrationRoot, 'extension'),
      await fs.realpath(path.join(integrationRoot, 'extension')).catch(() => null)
    ].filter(Boolean);

    for (const p of possiblePaths) {
      ids.add(computeExtensionId(p));
    }

    let profiles;
    try { profiles = await fs.readdir(profileRoot, { withFileTypes: true }); } catch { profiles = []; }
    for (const profile of profiles.filter(p => p.isDirectory() && (p.name === '.' || /^(Default|Profile \d+)$/.test(p.name)))) {
      for (const file of ['Preferences', 'Secure Preferences']) {
        try {
          const settings = JSON.parse(await fs.readFile(path.join(profileRoot, profile.name, file), 'utf8')).extensions?.settings || {};
          for (const [id, entry] of Object.entries(settings)) {
            if (!/^[a-p]{32}$/.test(id) || !entry.path || !path.isAbsolute(entry.path)) continue;
            const installed = await fs.realpath(entry.path).catch(() => null);
            const expected = await fs.realpath(path.join(integrationRoot, 'extension')).catch(() => null);
            let ownExtension = installed && expected && installed === expected;
            if (installed && !ownExtension) {
              const manifest = JSON.parse(await fs.readFile(path.join(installed, 'manifest.json'), 'utf8'));
              const background = await fs.readFile(path.join(installed, 'background.js'), 'utf8');
              ownExtension = manifest.name === 'Awesome Downloader Integration' && manifest.background?.service_worker === 'background.js' && background.includes("const HOST = 'com.awesome.downloader'");
            }
            if (ownExtension) ids.add(id);
          }
        } catch {}
      }
    }

    const manifestDir = MANIFEST_DIRS[browser];
    if (manifestDir) {
      try {
        await fs.mkdir(manifestDir, { recursive: true });
        const manifestPath = path.join(manifestDir, `${host}.json`);
        let existingOrigins = [];
        try {
          const existing = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
          if (Array.isArray(existing.allowed_origins)) existingOrigins = existing.allowed_origins;
        } catch {}

        for (const id of ids) {
          const origin = `chrome-extension://${id}/`;
          if (!existingOrigins.includes(origin)) existingOrigins.push(origin);
        }

        if (existingOrigins.length > 0) {
          const manifest = {
            name: host,
            description: 'Awesome Downloader browser bridge',
            path: nativeHostPath,
            type: 'stdio',
            allowed_origins: existingOrigins
          };
          await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
          results.push({ browser, connected: true });
        }
      } catch {}
    }
  }
  return results;
}

async function prepareNativeHost(integrationRoot, executable) {
  const folder = path.join(integrationRoot, 'integration');
  const target = path.join(folder, 'native-host.sh');
  const script = `#!/bin/bash\nexport ELECTRON_RUN_AS_NODE=1\nexec "${executable}" "$(dirname "$0")/native-host.cjs"\n`;
  await fs.writeFile(target, script, { mode: 0o755 });
  await fs.writeFile(path.join(folder, 'runtime-path.txt'), executable, 'utf8');
}

module.exports = { BROWSERS, browserSpec, registerBrowser, connectInstalledBrowsers, prepareNativeHost, computeExtensionId };
