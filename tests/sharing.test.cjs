const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { shareMime, expiredExport, downloadForSharing } = require('../lib/photoSharing.ts');
test('share targets receive photo/video types when server omits MIME or returns generic binary', () => {
  assert.equal(shareMime('IMG.JPG'), 'image/jpeg');
  assert.equal(shareMime('clip.mov', 'application/octet-stream'), 'video/quicktime');
  assert.equal(shareMime('photo.heic', 'image/jpeg; charset=binary'), 'image/jpeg');
});
test('share cleanup preserves recent handoffs and unrelated cache entries', () => {
  const now = 1790000000000;
  assert.equal(expiredExport(`photo-export-${now}`, now), false);
  assert.equal(expiredExport(`photo-export-${now - 86400001}`, now), true);
  assert.equal(expiredExport('image-cache-1', now), false);
  assert.equal(expiredExport('photo-export-invalid', now), false);
});
test('stalled download unlocks action even if native cancellation stalls', async () => {
  let paused = false;
  await assert.rejects(downloadForSharing({ downloadAsync: () => new Promise(() => {}), pauseAsync: () => { paused = true; return new Promise(() => {}); } }, 5), /timed out/);
  assert.equal(paused, true);
});
test('successful download is not cancelled and transfer errors are preserved', async () => {
  let paused = false;
  assert.equal(await downloadForSharing({ downloadAsync: async () => 'file', pauseAsync: async () => { paused = true; } }, 5), 'file');
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(paused, false);
  await assert.rejects(downloadForSharing({ downloadAsync: async () => { throw new Error('offline'); }, pauseAsync: async () => {} }), /offline/);
});
