import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { extractFacebookMedia, isFacebook, unescapeJsonUrl } = require('../extension/facebook-media.js');
const { mediaChoices } = require('../extension/media-choices.js');
import { isNonRangedHost } from '../core/http.mjs';

test('identifies facebook URLs', () => {
  assert.equal(isFacebook('https://www.facebook.com/watch/?v=123456789'), true);
  assert.equal(isFacebook('https://m.facebook.com/reel/987654321'), true);
  assert.equal(isFacebook('https://fb.watch/xyz123'), true);
  assert.equal(isFacebook('https://scontent.fdac179-1.fna.fbcdn.net/o1/v/t2/sample.mp4'), true);
  assert.equal(isFacebook('https://youtube.com/watch?v=123'), false);
});

test('identifies non-ranged hosts', () => {
  assert.equal(isNonRangedHost('https://scontent.fdac179-1.fna.fbcdn.net/o1/v/t2/sample.mp4'), true);
  assert.equal(isNonRangedHost('https://video.xx.fbcdn.net/v/sample.mp4'), true);
  assert.equal(isNonRangedHost('https://facebook.com/video.mp4'), true);
  assert.equal(isNonRangedHost('https://scontent.cdninstagram.com/v/sample.mp4'), true);
  assert.equal(isNonRangedHost('https://example.com/file.bin'), false);
});

test('unescapes JSON escaped URLs', () => {
  const escaped = 'https:\\/\\/video.xx.fbcdn.net\\/v\\/t42.17977-2\\/test.mp4?_nc_cat=1&amp;oh=abc\\u0026oe=123';
  const clean = unescapeJsonUrl(escaped);
  assert.equal(clean.includes('\\/'), false);
  assert.equal(clean.includes('\\u0026'), false);
  assert.equal(clean.startsWith('https://video.xx.fbcdn.net/'), true);
});

test('extracts HD and SD playable URLs from Facebook page scripts', () => {
  const sample = `
    {"require":[["BDHeader",[],[],[]]],"define":[["VideoPlayerConfig",[],{"browser_native_hd_url":"https:\\/\\/video.fsub.fbcdn.net\\/v\\/hd_sample.mp4?test=1","browser_native_sd_url":"https:\\/\\/video.fsub.fbcdn.net\\/v\\/sd_sample.mp4?test=2","playable_url_quality_hd":"https:\\/\\/video.fsub.fbcdn.net\\/v\\/hd_sample.mp4?test=1","playable_url":"https:\\/\\/video.fsub.fbcdn.net\\/v\\/sd_sample.mp4?test=2"}]]}
  `;
  const items = extractFacebookMedia(sample, 'https://www.facebook.com/watch?v=123');
  assert.equal(items.length, 2);
  assert.equal(items[0].quality, 'HD');
  assert.equal(items[0].url, 'https://video.fsub.fbcdn.net/v/hd_sample.mp4?test=1');
  assert.equal(items[1].quality, 'SD');
  assert.equal(items[1].url, 'https://video.fsub.fbcdn.net/v/sd_sample.mp4?test=2');

  const choices = mediaChoices(items);
  assert.equal(choices.length, 2);
  assert.equal(choices[0].audioState, 'Video + audio');
});
