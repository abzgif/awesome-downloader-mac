const path = require('node:path');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');

async function openExtensions(browser) {
  const definitions = {
    Chrome: { app: 'Google Chrome', binaries: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'], url: 'chrome://extensions/' },
    Edge: { app: 'Microsoft Edge', binaries: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'], url: 'edge://extensions/' },
    Brave: { app: 'Brave Browser', binaries: ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'], url: 'brave://extensions/' },
    Opera: { app: 'Opera', binaries: ['/Applications/Opera.app/Contents/MacOS/Opera'], url: 'opera://extensions/' }
  };
  const definition = definitions[browser];
  if (!definition) throw new Error('Choose Chrome, Edge, Brave, or Opera.');

  for (const executable of definition.binaries) {
    try { await fs.access(executable); } catch { continue; }
    await new Promise((resolve, reject) => {
      const child = spawn(executable, [definition.url], { detached: true, stdio: 'ignore' });
      child.once('error', reject);
      child.once('spawn', () => { child.unref(); resolve(); });
    });
    return;
  }
  // Fallback: use macOS `open` command with app name
  try {
    await new Promise((resolve, reject) => {
      const child = spawn('open', ['-a', definition.app, definition.url], { detached: true, stdio: 'ignore' });
      child.once('error', reject);
      child.once('spawn', () => { child.unref(); resolve(); });
    });
  } catch {
    throw new Error(`${browser} was not found. Open ${definition.url} in your browser manually.`);
  }
}
module.exports = { openExtensions };
