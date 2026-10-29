// Facebook progressive media URL parser and extractor
(function(root) {
  function unescapeJsonUrl(str) {
    if (!str) return null;
    try {
      // Decode escaped forward slashes and unicode sequences
      return JSON.parse('"' + str.replace(/^"|"$/g, '').replace(/\\"/g, '"') + '"');
    } catch {
      return str.replace(/\\\//g, '/').replace(/\\u0026/g, '&');
    }
  }

  function extractFacebookMedia(text, pageUrl) {
    if (!text || typeof text !== 'string') return [];
    const results = [];
    const seen = new Set();

    // Match HD and SD video URLs embedded in Facebook HTML / JSON scripts
    const patterns = [
      { key: 'playable_url_quality_hd', quality: 'HD' },
      { key: 'browser_native_hd_url', quality: 'HD' },
      { key: 'playable_url', quality: 'SD' },
      { key: 'browser_native_sd_url', quality: 'SD' }
    ];

    for (const { key, quality } of patterns) {
      const regex = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'gi');
      let match;
      while ((match = regex.exec(text)) !== null) {
        const raw = match[1];
        const clean = unescapeJsonUrl(raw);
        if (clean && /^https?:\/\//i.test(clean) && !seen.has(clean)) {
          seen.add(clean);
          results.push({
            url: clean,
            quality,
            format: 'MP4',
            outputFormat: 'mp4',
            audioState: 'Video + audio',
            provider: 'facebook',
            title: 'Facebook Video (' + quality + ')'
          });
        }
      }
    }

    return results;
  }

  function isFacebook(url) {
    try {
      const u = new URL(url);
      return /(^|\.)facebook\.com$/.test(u.hostname) || /(^|\.)fb\.watch$/.test(u.hostname);
    } catch {
      return false;
    }
  }

  const facebookMedia = {
    extractFacebookMedia,
    isFacebook,
    unescapeJsonUrl
  };

  root.facebookMedia = facebookMedia;
  if (typeof module !== 'undefined') module.exports = facebookMedia;
})(typeof globalThis !== 'undefined' ? globalThis : this);
