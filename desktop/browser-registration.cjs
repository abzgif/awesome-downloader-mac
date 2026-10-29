const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);

const BROWSERS = {
  Chrome: { registry: 'Google\\Chrome', manifestKey: 'Chrome', data: 'Google/Chrome/User Data', macData: 'Google/Chrome', dataRoot: 'local' },
  Edge: { registry: 'Microsoft\\Edge', manifestKey: 'Edge', data: 'Microsoft/Edge/User Data', macData: 'Microsoft Edge', dataRoot: 'local' },
  Brave: { registry: 'BraveSoftware\\Brave-Browser', manifestKey: 'Brave', data: 'BraveSoftware/Brave-Browser/User Data', macData: 'BraveSoftware/Brave-Browser', dataRoot: 'local' },
  Opera: { registry: 'Google\\Chrome', manifestKey: 'Opera', data: 'Opera Software/Opera Stable', macData: 'com.operasoftware.Opera', dataRoot: 'roaming', rootProfile: true },
  Firefox: { registry: 'Mozilla', manifestKey: 'Firefox', firefox: true }
};

const MANIFEST_DIRS = {
  Chrome: path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts'),
  Edge: path.join(os.homedir(), 'Library', 'Application Support', 'Microsoft Edge', 'NativeMessagingHosts'),
  Brave: path.join(os.homedir(), 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser', 'NativeMessagingHosts'),
  Opera: path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts'),
  Firefox: path.join(os.homedir(), 'Library', 'Application Support', 'Mozilla', 'NativeMessagingHosts')
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
  const isWindows = process.platform === 'win32';
  const nativeHostPath = path.join(integrationRoot, 'integration', isWindows ? 'native-host.exe' : 'native-host.sh');
  const manifest = { name: host, description: 'Awesome Downloader browser bridge', path: nativeHostPath, type: 'stdio' };
  if (spec.firefox) manifest.allowed_extensions = [extensionId];
  else manifest.allowed_origins = [`chrome-extension://${extensionId}/`];

  await fs.access(nativeHostPath);

  if (isWindows) {
    const key = `HKCU\\Software\\${spec.registry}\\NativeMessagingHosts\\${host}`;
    const folder = path.join(dataDirectory, 'NativeMessaging');
    const manifestName = browser === 'Opera' ? 'Chrome' : browser;
    const manifestPath = path.join(folder, `${manifestName}.json`);
    await fs.mkdir(folder, { recursive: true });
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
    let registry = null;
    try { registry = (await exec('reg.exe', ['QUERY', key, '/ve'], { windowsHide: true })).stdout; }
    catch (error) { if (error.code !== 1) throw error; }
    const previousPath = registry?.match(/REG_SZ\s+(.+)\r?\n?/)?.[1]?.trim();
    if (registry && previousPath !== manifestPath) await fs.writeFile(path.join(folder, `${browser}.${stamp}.registry-backup.txt`), registry);
    if (previous !== content) await fs.writeFile(manifestPath, content, 'utf8');
    if (previousPath !== manifestPath) await exec('reg.exe', ['ADD', key, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f'], { windowsHide: true });
    let extensionPath = path.join(integrationRoot, 'extension');
    if (spec.firefox) {
      extensionPath = path.join(folder, 'firefox-extension');
      await fs.cp(path.join(integrationRoot, 'extension'), extensionPath, { recursive: true });
      await fs.copyFile(path.join(extensionPath, 'manifest.firefox.json'), path.join(extensionPath, 'manifest.json'));
    }
    return { ok: true, manifestPath, extensionPath };
  } else {
    // macOS
    const manifestDir = MANIFEST_DIRS[spec.manifestKey];
    const manifestPath = path.join(manifestDir, `${host}.json`);
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
}

async function connectInstalledBrowsers({ dataDirectory, integrationRoot, localAppData = process.env.LOCALAPPDATA, roamingAppData = process.env.APPDATA }, { register = registerBrowser } = {}) {
  const results = [];
  const expected = await fs.realpath(path.join(integrationRoot, 'extension')).catch(() => path.join(integrationRoot, 'extension'));
  const isWindows = process.platform === 'win32';

  for (const [browser, spec] of Object.entries(BROWSERS).filter(([, value]) => !value.firefox)) {
    let root;
    if (localAppData || roamingAppData) {
      const base = spec.dataRoot === 'roaming' ? roamingAppData : localAppData;
      if (base) root = path.join(base, spec.data);
    } else if (!isWindows) {
      root = path.join(os.homedir(), 'Library', 'Application Support', spec.macData);
    }
    if (!root) continue;

    const ids = new Set();
    if (!isWindows) {
      // On macOS, register computed unpacked extension ID directly as well
      ids.add(computeExtensionId(expected));
    }

    let profiles;
    try { profiles = await fs.readdir(root, { withFileTypes: true }); } catch { profiles = []; }
    if (spec.rootProfile && profiles.length) profiles = [{ name: '.', isDirectory: () => true }, ...profiles];

    for (const profile of profiles.filter(p => p.isDirectory() && (p.name === '.' || /^(Default|Profile \d+)$/.test(p.name)))) {
      for (const file of ['Preferences', 'Secure Preferences']) {
        try {
          const settings = JSON.parse(await fs.readFile(path.join(root, profile.name, file), 'utf8')).extensions?.settings || {};
          for (const [id, entry] of Object.entries(settings)) {
            if (!/^[a-p]{32}$/.test(id) || !entry.path || !path.isAbsolute(entry.path)) continue;
            const installed = await fs.realpath(entry.path).catch(() => null);
            let ownExtension = installed?.toLowerCase() === expected.toLowerCase();
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

    if (ids.size) {
      for (const extensionId of ids) await register({ browser, extensionId }, { dataDirectory, integrationRoot });
      results.push({ browser, connected: true });
    }
  }
  return results;
}

async function prepareNativeHost(integrationRoot, executable) {
  const folder = path.join(integrationRoot, 'integration');
  if (process.platform === 'win32') {
    const target = path.join(folder, 'native-host.exe');
    try { await fs.access(target); }
    catch {
      const compiler = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
      await exec(compiler, ['/nologo', '/target:exe', `/out:${target}`, path.join(folder, 'NativeHostLauncher.cs')], { windowsHide: true });
    }
  } else {
    const target = path.join(folder, 'native-host.sh');
    const script = `#!/bin/bash\nexport ELECTRON_RUN_AS_NODE=1\nexec "${executable}" "$(dirname "$0")/native-host.cjs"\n`;
    await fs.writeFile(target, script, { mode: 0o755 });
  }
  await fs.writeFile(path.join(folder, 'runtime-path.txt'), executable, 'utf8');
}

module.exports = { BROWSERS, browserSpec, registerBrowser, connectInstalledBrowsers, prepareNativeHost, computeExtensionId };
