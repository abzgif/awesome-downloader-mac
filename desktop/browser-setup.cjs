const path = require('node:path');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');

async function openExtensions(browser) {
  if (!['Chrome', 'Edge'].includes(browser)) throw new Error('Choose Chrome or Edge.');
  // macOS application paths
  const apps = {
    Chrome: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
    Edge: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
  };
  const url = browser === 'Chrome' ? 'chrome://extensions/' : 'edge://extensions/';
  const candidates = apps[browser];
  for (const executable of candidates) {
    try { await fs.access(executable); } catch { continue; }
    await new Promise((resolve, reject) => {
      const child = spawn(executable, [url], { detached: true, stdio: 'ignore' });
      child.once('error', reject);
      child.once('spawn', () => { child.unref(); resolve(); });
    });
    return;
  }
  // Fallback: use macOS `open` command
  await new Promise((resolve, reject) => {
    const child = spawn('open', ['-a', browser === 'Chrome' ? 'Google Chrome' : 'Microsoft Edge', url], { detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}
module.exports = { openExtensions };
