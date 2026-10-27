const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

// macOS native messaging manifest directories per browser.
const MANIFEST_DIRS = {
  Chrome: path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts'),
  Edge: path.join(os.homedir(), 'Library', 'Application Support', 'Microsoft Edge', 'NativeMessagingHosts'),
  Firefox: path.join(os.homedir(), 'Library', 'Application Support', 'Mozilla', 'NativeMessagingHosts')
};

// macOS profile directories per browser.
const PROFILE_DIRS = {
  Chrome: path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome'),
  Edge: path.join(os.homedir(), 'Library', 'Application Support', 'Microsoft Edge')
};

async function registerBrowser({ browser, extensionId }, { dataDirectory, integrationRoot }) {
  if (!['Chrome', 'Edge', 'Firefox'].includes(browser)) throw new Error('Choose Chrome, Edge, or Firefox.');
  if (typeof extensionId !== 'string' || !(browser === 'Firefox' ? /^[A-Za-z0-9@._{}-]{1,128}$/ : /^[a-p]{32}$/).test(extensionId)) throw new Error('Copy the extension ID from your browser's extensions page.');
  const host = 'com.awesome.downloader';
  const nativeHostPath = path.join(integrationRoot, 'integration', 'native-host.sh');
  const manifest = { name: host, description: 'Awesome Downloader browser bridge', path: nativeHostPath, type: 'stdio' };
  if (browser === 'Firefox') manifest.allowed_extensions = [extensionId];
  else manifest.allowed_origins = [`chrome-extension://${extensionId}/`];
  const content = JSON.stringify(manifest, null, 2);
  await fs.access(nativeHostPath);
  const manifestDir = MANIFEST_DIRS[browser];
  await fs.mkdir(manifestDir, { recursive: true });
  const manifestPath = path.join(manifestDir, `${host}.json`);
  let previous;
  try { previous = await fs.readFile(manifestPath, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  if (previous && previous !== content) await fs.writeFile(`${manifestPath}.${stamp}.bak`, previous);
  if (previous !== content) await fs.writeFile(manifestPath, content, 'utf8');
  let extensionPath = path.join(integrationRoot, 'extension');
  if (browser === 'Firefox') {
    const folder = path.join(dataDirectory, 'NativeMessaging');
    await fs.mkdir(folder, { recursive: true });
    extensionPath = path.join(folder, 'firefox-extension');
    await fs.cp(path.join(integrationRoot, 'extension'), extensionPath, { recursive: true });
    await fs.copyFile(path.join(extensionPath, 'manifest.firefox.json'), path.join(extensionPath, 'manifest.json'));
  }
  return { ok: true, manifestPath, extensionPath };
}

// Read only extension registrations, never browser history, cookies, or page data.
async function connectInstalledBrowsers({ dataDirectory, integrationRoot }) {
  const results = [];
  for (const [browser, profileRoot] of Object.entries(PROFILE_DIRS)) {
    let profiles;
    try { profiles = await fs.readdir(profileRoot, { withFileTypes: true }); } catch { continue; }
    const ids = new Set();
    for (const profile of profiles.filter(p => p.isDirectory() && /^(Default|Profile \d+)$/.test(p.name))) {
      for (const file of ['Preferences', 'Secure Preferences']) {
        try {
          const settings = JSON.parse(await fs.readFile(path.join(profileRoot, profile.name, file), 'utf8')).extensions?.settings || {};
          for (const [id, entry] of Object.entries(settings)) {
            if (!/^[a-p]{32}$/.test(id) || !entry.path || !path.isAbsolute(entry.path)) continue;
            const installed = await fs.realpath(entry.path).catch(() => null);
            const expected = await fs.realpath(path.join(integrationRoot, 'extension'));
            let ownExtension = installed === expected;
            if (installed && !ownExtension) {
              const manifest = JSON.parse(await fs.readFile(path.join(installed, 'manifest.json'), 'utf8'));
              const background = await fs.readFile(path.join(installed, 'background.js'), 'utf8');
              ownExtension = manifest.name === 'Awesome Downloader Integration' && manifest.background?.service_worker === 'background.js' && background.includes("const HOST = 'com.awesome.downloader'");
            }
            if (ownExtension) ids.add(id);
          }
        } catch { /* A running browser can temporarily replace a preference file. */ }
      }
    }
    if (ids.size) {
      const result = await registerBrowser({ browser, extensionId: [...ids][0] }, { dataDirectory, integrationRoot });
      // Multiple profiles may assign different IDs to this same unpacked extension.
      const manifest = JSON.parse(await fs.readFile(result.manifestPath, 'utf8'));
      manifest.allowed_origins = [...ids].map(id => `chrome-extension://${id}/`);
      await fs.writeFile(result.manifestPath, JSON.stringify(manifest, null, 2));
      results.push({ browser, connected: true });
    }
  }
  return results;
}

async function prepareNativeHost(integrationRoot, executable) {
  const folder = path.join(integrationRoot, 'integration');
  const target = path.join(folder, 'native-host.sh');
  // Create the shell script that launches the native host via Electron.
  const script = `#!/bin/bash\nexport ELECTRON_RUN_AS_NODE=1\nexec "${executable}" "$(dirname "$0")/native-host.cjs"\n`;
  await fs.writeFile(target, script, { mode: 0o755 });
  await fs.writeFile(path.join(folder, 'runtime-path.txt'), executable, 'utf8');
}

module.exports = { registerBrowser, connectInstalledBrowsers, prepareNativeHost };
