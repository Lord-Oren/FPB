// Pond Desk T12: server progress (202 + GET /jobs/:id) and unknown results. A lost or unreadable answer after a
// write is "unknown": never "Done", never "nothing was added", and never sent again automatically.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const app = readFileSync(new URL('../editor/v2/app.js', import.meta.url), 'utf8');
const api = app.slice(app.indexOf('// api:start'), app.indexOf('// api:end'));
const block = app.slice(app.indexOf('// progress:start'), app.indexOf('// progress:end'));
const reply = (status, body) => ({ status, ok: status >= 200 && status < 300, text: async () => typeof body === 'string' ? body : JSON.stringify(body) });
function client(script) {
  const sent = [], marks = { uncertain: 0 }, server = [];
  const fetch = async (url, options = {}) => {
    sent.push({ url, method: options.method || 'GET', prefer: options.headers?.Prefer || '' });
    const next = script.shift(); if (!next) throw new Error('unexpected request ' + url);
    if (next === 'cut') throw new TypeError('Failed to fetch');
    return reply(next[0], next[1]);
  };
  const context = { fetch, state: { token: 't' }, API: '/api/v2', setTimeout: fn => { fn(); return 0; }, progressCard: { uncertain: () => { marks.uncertain++; } }, Symbol, JSON, Object, Number, Array, Promise, Error, TypeError, String };
  vm.createContext(context); vm.runInContext(api + '\nglobalThis.api={call,track,upload,trackUpload};', context);
  const steps = { server: list => server.push(list), measure() {}, step() {} };
  return { ...context.api, sent, marks, server, steps };
}
const running = [{ id: 'content', label: 'Checking the content', state: 'done' }, { id: 'build-a', label: 'Building version A', state: 'running' }];
test('jobs: 202 is only accepted; the result comes from state done, after real steps', async () => {
  const c = client([[202, { job: { id: 'job-1' } }], [200, { id: 'job-1', state: 'running', steps: running }], [200, { id: 'job-1', state: 'done', steps: running.map(s => ({ ...s, state: 'done' })), result: { message: 'Published ✓', item: { id: 'x' } } }]]);
  const result = await c.track('/items/x/publish', { revision: 2 }, c.steps);
  assert.equal(result.message, 'Published ✓'); assert.equal(result.item.id, 'x');
  assert.equal(c.sent.filter(r => r.method === 'POST').length, 1, 'the write is sent once');
  assert.equal(c.sent[0].prefer, 'respond-async'); assert.equal(c.sent[1].url, '/api/v2/jobs/job-1');
  assert.equal(c.server.length, 2); assert.equal(c.server[0][1].label, 'Building version A');
});
test('jobs: a failed job is a known failure with the server message and diagnostics', async () => {
  const c = client([[202, { job: { id: 'j' } }], [200, { id: 'j', state: 'failed', steps: running, error: { step: 'build-a', status: 422, message: 'The site could not be built. The previous site is still available.', diagnostics: [{ field: 'x', message: 'y' }] } }]]);
  await assert.rejects(c.track('/structure/publish', {}, c.steps), error => error.status === 422 && !error.unknown && /could not be built/.test(error.message) && error.diagnostics.length === 1);
});
test('jobs: 404 after a restart, a lost sign-in or an unreadable poll end as unknown', async () => {
  for (const [poll, extra] of [[[404, { message: 'Operation not found.' }], ''], [[403, { message: 'Sign in' }], 'sign-in'], [[200, '<html>'], ''], [[200, { state: 'maybe', steps: [] }], '']]) {
    const c = client([[202, { job: { id: 'j' } }], poll]);
    await assert.rejects(c.track('/structure/publish', {}, c.steps), error => error.unknown && /result is unknown/.test(error.message) && /Site history/.test(error.message) && (!extra || /sign-in/.test(error.message)));
    assert.equal(c.marks.uncertain, 1); assert.equal(c.sent.filter(r => r.method === 'POST').length, 1, 'never sent again');
  }
});
test('jobs: short network cuts while polling are retried, a longer cut is unknown', async () => {
  const ok = client([[202, { job: { id: 'j' } }], 'cut', 'cut', [200, { state: 'done', steps: running, result: { message: 'ok' } }]]);
  assert.equal((await ok.track('/pages/about/publish', {}, ok.steps)).message, 'ok');
  const lost = client([[202, { job: { id: 'j' } }], 'cut', 'cut', 'cut']);
  await assert.rejects(lost.track('/pages/about/publish', {}, lost.steps), error => error.unknown);
});
test('jobs: an accepted answer without a job id is unknown; a server without jobs answers directly', async () => {
  const bad = client([[202, { job: {} }]]);
  await assert.rejects(bad.track('/publishes/r/restore', {}, bad.steps), error => error.unknown && /Site history/.test(error.message));
  const direct = client([[200, { message: 'Published ✓' }]]);
  assert.equal((await direct.track('/pages/wording/publish', {}, direct.steps)).message, 'Published ✓');
  assert.equal(direct.sent.length, 1);
});
test('writes: lost or unreadable answers are unknown, never a success or "nothing was added"', async () => {
  for (const answer of ['cut', [200, ''], [200, '{oops'], [502, '<html>Bad gateway</html>'], [504, '']]) {
    const c = client([answer]);
    await assert.rejects(c.call('PUT', '/pages/about', { fields: {} }), error => error.unknown && /result is unknown/.test(error.message) && /saved/.test(error.message));
    assert.equal(c.sent.length, 1, 'no automatic retry');
  }
  const known = client([[422, { message: 'Check the fields.', diagnostics: [{ field: 'title', message: 'Required' }] }]]);
  await assert.rejects(known.call('PUT', '/pages/about', {}), error => !error.unknown && error.status === 422 && error.diagnostics.length === 1);
  const read = client([[200, '{oops']]);
  await assert.rejects(read.call('GET', '/structure'), error => !error.unknown && error.code === 'protocol');
  assert.doesNotMatch(app, /Nothing was added/);
});
test('uploads: a cut connection or an unreadable answer is unknown, with where to check', async () => {
  let request;
  class XHR { constructor() { request = this; this.upload = {}; } open() {} setRequestHeader(k, v) { this[k] = v; } send() {} }
  const c = client([]); const context = vm.createContext({ ...c, XMLHttpRequest: XHR });
  vm.runInContext(api.replace(/^/, '') + '\nglobalThis.go=(p,b)=>upload(p,b,null);', Object.assign(context, { fetch: null, state: { token: 't' }, API: '/api/v2', setTimeout, progressCard: { uncertain() {} }, Symbol, JSON, Object, Number, Array, Promise, Error, String }));
  const cut = context.go('/files', {}); request.onerror(); await assert.rejects(cut, error => error.unknown && /file may have been added/.test(error.message));
  const garbled = context.go('/media', {}); request.status = 200; request.responseText = 'not json'; request.onload(); await assert.rejects(garbled, error => error.unknown);
});
test('progress card: server steps replace the last step, page counts are real, unknown is its own end', () => {
  let box = null; const text = node => node == null ? '' : typeof node === 'string' ? node : [node.text ?? '', ...(node.kids ?? [])].map(text).join(' ');
  const h = (tag, attrs = {}, ...kids) => { const node = { tag, ...attrs, dataset: {}, hidden: false, kids: kids.flat().filter(k => k !== null && k !== undefined), replaceChildren(...k) { this.kids = k; } }; if (attrs.id === 'progress') box = node; return node; };
  const context = { h, $: s => s === '#toast' ? { hidden: true } : null, WAIT_TEXT: 'w', setTimeout: () => 0, clearTimeout: () => {}, Math, Number, Array, String };
  vm.createContext(context); vm.runInContext(block + '\nglobalThis.card = progressCard;', context);
  const card = context.card; const steps = card.start({ title: 'Adding the file', steps: ['Reading the file', 'Uploading', 'Checking the file on the server'] });
  steps.step(2);
  steps.server([{ id: 'format', label: 'Checking the format', state: 'done' }, { id: 'processing', label: 'Processing the file', state: 'running', done: 3, total: 12 }, { id: 'saving', label: 'Saving the file', state: 'waiting' }]);
  assert.match(text(box), /Step 4 of 5/); assert.match(text(box), /3 of 12 pages/); assert.doesNotMatch(text(box), /Checking the file on the server/);
  const fill = JSON.stringify(box).match(/width:(\d+)%/)[1]; assert.equal(Number(fill), Math.floor((3 + 3 / 12) / 5 * 100), 'the bar moves by the pages really done');
  card.uncertain(); steps.fail('Pond Desk lost the server’s answer, so the result is unknown');
  assert.equal(box.dataset.state, 'unknown'); assert.match(text(box), /Result unknown/); assert.doesNotMatch(text(box), /Done|Stopped/);
  steps.finish('Done'); assert.equal(box.dataset.state, 'unknown', 'an unknown result never turns into a success');
});
