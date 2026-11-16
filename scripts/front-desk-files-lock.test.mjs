// Pond Desk reads a chosen file inside the shared Save/Publish lock (CDX-20261116-003, P2), so a publish
// cannot start between choosing a file and sending it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../editor/v2/app.js', import.meta.url), 'utf8');

test('Desk reads files only through readBase64, and only inside busy()', () => {
  assert.equal(app.match(/new FileReader\(/g)?.length, 1);
  assert.match(app, /const readBase64 = file => new Promise\(\(resolve, reject\) => \{ const reader = new FileReader\(\)/);
  const calls = [...app.matchAll(/readBase64\(file\)/g)];
  assert.equal(calls.length, 2);
  for (const call of calls) {
    const line = app.slice(app.lastIndexOf('\n', call.index), app.indexOf('\n', call.index));
    assert.match(line, /await busy\(null, async \(\) => call\('POST', '\/(media|files)'/);
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
