// AUD-C09: Pond Desk allows one writing action at a time. Publish and Save of the same form, an upload during a
// publish, or a double Ctrl+Enter must never send two requests. The lock code is read from editor/v2/app.js.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../editor/v2/app.js', import.meta.url), 'utf8');
const block = source.slice(source.indexOf('// lock:start'), source.indexOf('// lock:end'));
assert.ok(block.includes('async function busy'), 'lock block not found in app.js');

function harness() {
  const control = name => { const attrs = new Map(); return { name, disabled: false, setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k), getAttribute: k => attrs.get(k) ?? null }; };
  const publish = control('publish'), save = control('save'), upload = control('upload');
  const main = { ...control('main'), querySelectorAll: () => [publish, save, upload] };
  const toastBox = { hidden: true };
  const toasts = [];
  const toast = (text, { stay = false } = {}) => { toasts.push(text); toast.staying = stay; };
  const $ = selector => selector === '#main' ? main : selector === '#toast' ? toastBox : null;
  const api = new Function('$', 'toast', block + '\nreturn { busy, lock, WAIT_TEXT };')($, toast);
  return { ...api, publish, save, upload, main, toasts };
}
const later = () => { let open; const promise = new Promise(resolve => { open = resolve; }); return { promise, open }; };

test('Publish and Save of the same form share one lock', async () => {
  const { busy, publish, save, upload, main, toasts, WAIT_TEXT } = harness();
  const gate = later(); let requests = 0;
  const first = busy(publish, async () => { requests++; await gate.promise; return 'published'; }, 'Publishing…');
  assert.equal(publish.disabled, true); assert.equal(save.disabled, true); assert.equal(upload.disabled, true);
  assert.equal(main.getAttribute('aria-busy'), 'true');
  const second = await busy(save, async () => { requests++; return 'saved'; });
  assert.equal(second, undefined); assert.equal(requests, 1); assert.ok(toasts.includes(WAIT_TEXT));
  gate.open(); assert.equal(await first, 'published');
  assert.equal(publish.disabled, false); assert.equal(save.disabled, false); assert.equal(upload.disabled, false);
  assert.equal(main.getAttribute('aria-busy'), null);
  assert.equal(await busy(save, async () => { requests++; return 'saved'; }), 'saved'); assert.equal(requests, 2);
});

test('an upload cannot start during a publish, and a publish cannot start during an upload', async () => {
  const { busy, publish } = harness();
  const gate = later(); let uploads = 0, publishes = 0;
  const upload = busy(null, async () => { uploads++; await gate.promise; return { id: 'file-1' }; }, 'Checking the file…');
  assert.equal(await busy(publish, async () => { publishes++; }), undefined);
  gate.open(); assert.deepEqual(await upload, { id: 'file-1' }); assert.equal(uploads, 1); assert.equal(publishes, 0);
});

test('a failed action releases the lock and shows the server message', async () => {
  const { busy, publish, save, toasts } = harness();
  assert.equal(await busy(publish, async () => { throw new Error('This file is too large (10 MB maximum).'); }), undefined);
  assert.ok(toasts.includes('This file is too large (10 MB maximum).'));
  assert.equal(publish.disabled, false); assert.equal(save.disabled, false);
  assert.equal(await busy(save, async () => 'ok'), 'ok');
});
