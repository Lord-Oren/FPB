// Pond Desk reads a chosen file inside the shared Save/Publish lock (CDX-20261116-003, P2), so a publish
// cannot start between choosing a file and sending it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../editor/v2/app.js', import.meta.url), 'utf8');

test('Desk reads files only through readBase64, and only inside busy()', () => {
  assert.equal(app.match(/new FileReader\(/g)?.length, 1);
  assert.match(app, /const readBase64 = \(file, onProgress\) => new Promise\(\(resolve, reject\) => \{ const reader = new FileReader\(\)/);
  const calls = [...app.matchAll(/readBase64\(file, \(read, size\) => steps\.measure\(read, size\)\)/g)];
  assert.equal(calls.length, 3, 'photos, team photos (T13) and PDF/video files');
  for (const call of calls) {
    const line = app.slice(app.lastIndexOf('\n', call.index), app.indexOf('\n', call.index));
    // Reading, then sending (with real byte progress), both inside the shared lock.
    assert.match(line, /await busy\(null, async steps => \{ const base64 = await readBase64\(file, .*(?:upload|trackUpload)\('\/(media|files)', \{ name: file\.name, base64 \}, steps\)/);
  }
});

test('Desk shows every delivery status without claiming a simulated email was sent', () => {
  for (const status of ['queued', 'sent', 'failed', 'review_required']) assert.match(app, new RegExp(`${status}: '`));
  assert.match(app, /message\.status === 'simulated'\) return 'test, not sent'/);
});

test('An original attachment is only downloaded after a warning', () => {
  assert.match(app, /attachments\/\$\{file\.id\}\?original=1&confirm=1/);
  assert.match(app, /original\.addEventListener\('click', event => \{ if \(!confirm\(/);
});

test('an unconfirmed delivery is never shown as sent or as not sent, and sending again asks first', () => {
  assert.match(app, /review_required: 'delivery not confirmed'/);
  assert.match(app, /\?\? 'status unavailable'/);
  const retry = app.slice(app.indexOf('function retryRow'), app.indexOf('const fileSize'));
  assert.match(retry, /writer\(async/); assert.match(retry, /confirm\('This email may already have reached the person/);
  assert.ok(retry.indexOf('confirm(') < retry.indexOf('retry-reply'));
  assert.match(retry, /confirmPotentialDuplicate: true/);
});

test('access management follows the deployment value, not the legacy mode', () => {
  assert.doesNotMatch(app, /state\.mode === /);
  assert.match(app, /state\.deployment === 'hosted'/);
});

test('a footer social link named with punctuation only shows its icon and keeps a spoken name', async () => {
  const footer = await readFile(new URL('../src/components/Footer.astro', import.meta.url), 'utf8');
  assert.match(footer, /aria-label=\{iconOnly\(n\)\?network\(n\):undefined\}/);
  assert.match(footer, /\{iconOnly\(n\)\?'':' '\+n\.title\}/);
});
