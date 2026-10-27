# Awesome Downloader (macOS)

A macOS download manager with a compact desktop interface and browser video
buttons. Open-source implementation ported to macOS with native Apple Silicon
(arm64) and Intel (x64) support.

**Ported from:** [Awesome Downloader for Windows](https://github.com/TheAwesomeDeveloper/Awesome-Downloader-for-Windows).

**Early preview:** Private/sign-in-required, DRM and live media are unsupported.

## Features

- High-speed HTTP(S) multi-segmented parallel downloads.
- Pause/resume for supported transfers, history, scheduling, and speed limits.
- Chrome and Edge media detection and quality selection; selected video/audio tracks
  are combined locally with FFmpeg.
- Download File Info with custom save folder, categories, Download Later, and Start.
- Separate progress and completion windows, duplicate-active-download prevention.
- Native macOS integration: menu bar tray, dock support, DMG installer, and native messaging bridge.

## Installation

1. Download **Awesome-Downloader-0.1.0-macOS-arm64.dmg** (Apple Silicon M1/M2/M3/M4) or **x64.dmg** (Intel Macs) from GitHub Releases.
2. Open the DMG and drag **Awesome Downloader** into your **Applications** folder.
3. Launch Awesome Downloader from Applications or Spotlight.

## Browser Extension Setup (Chrome / Edge)

The browser extension allows one-click video detection and download:

1. Click **Browser Integration** in the Awesome Downloader toolbar.
2. Click **Copy extension folder path**.
3. Click **Open Chrome extensions** (or Edge).
4. Turn on **Developer mode** in your browser's Extensions page.
5. Click **Load unpacked**, press **Cmd+Shift+G**, paste the copied path, and select the folder.
6. The desktop app will automatically connect with the extension. Refresh any video page to see the download button.

## Development

```bash
# Install dependencies
npm install

# Run automated tests
npm test

# Start the desktop app in development
npm start

# Build package (DMG)
npm run dist
```

## License

Original project code is [MIT licensed](LICENSE). Included third-party binaries retain their respective licenses.
