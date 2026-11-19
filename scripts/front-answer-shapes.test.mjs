// Pond Desk T15 (T14-F01): a readable but incomplete answer after a write confirms nothing. {}, null, [], a missing
// field, or a job "done" without its result end as "Result unknown": never "Done", and the write is never sent again.
// Real answers (direct or through a job) and the server's own errors (422, 409) keep working as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const app = readFileSync(new URL('../editor/v2/app.js', import.meta.url), 'utf8');
const api = app.slice(app.indexOf('// api:start'), app.indexOf('// api:end'));
const reply = (status, body) => ({ status, ok: status >= 200 && status < 300, text: async () => typeof body === 'string' ? body : JSON.stringify(body) });
function client(script) {
  const sent = [], marks = { uncertain: 0 };
  const next = () => { const answer = script.shift(); if (!answer) throw new Error('unexpected request'); return answer; };
  const fetch = async (url, options = {}) => { sent.push({ url, method: options.method || 'GET' }); const answer = next(); if (answer === 'cut') throw new TypeError('Failed to fetch'); return reply(answer[0], answer[1]); };
  class XMLHttpRequest {
    constructor() { this.upload = {}; }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader() {}
    send() { sent.push({ url: this.url, method: this.method }); const [status, body] = next(); this.status = status; this.responseText = typeof body === 'string' ? body : JSON.stringify(body); queueMicrotask(() => this.onload()); }
  }
  const context = { fetch, XMLHttpRequest, queueMicrotask, state: { token: 't' }, API: '/api/v2', setTimeout: fn => { fn(); return 0; }, progressCard: { uncertain: () => { marks.uncertain++; } }, Symbol, JSON, Object, Number, Array, Promise, Error, TypeError, String };
  vm.createContext(context); vm.runInContext(api + '\nglobalThis.api={call,track,upload,trackUpload};', context);
  const steps = { server() {}, measure() {}, step() {} };
  return { ...context.api, sent, marks, steps, writes: () => sent.filter(r => r.method !== 'GET').length };
}
const tree = { revision: 4, fields: { schemaVersion: 1, nodes: [] }, live: { schemaVersion: 1, nodes: [] }, zones: [] };
const item = { id: 'item-1', revision: 2, status: 'draft', fields: {}, media: {} };
const file = { id: 'file-' + 'a'.repeat(24), name: 'deck.pdf', kind: 'pdf', size: 10, url: '/files/file-' + 'a'.repeat(24) };
// [method, path, a real success answer, incomplete answers that must stay unknown]
const ROUTES = [
  ['PUT', '/structure', tree, [{}, { revision: 4 }, { fields: { nodes: [] } }, { revision: '4', fields: { nodes: [] } }]],
  ['PUT', '/pages/about', { revision: 7 }, [{}, { revision: null }, { message: 'Saved' }]],
  ['PUT', '/pages/wording', { revision: 2 }, [{}]],
  ['POST', '/items', item, [{}, { id: 'item-1' }, { revision: 1 }]],
  ['PUT', '/items/item-1', item, [{}, { id: '', revision: 2 }]],
  ['POST', '/items/item-1/restore', item, [{}]],
  ['POST', '/items/item-1/publish', { message: 'Published ✓', item }, [{}, { message: 'Published ✓' }, { item }]],
  ['POST', '/items/item-1/unpublish', { message: 'Taken off ✓', item }, [{ message: '' , item }]],
  ['POST', '/structure/publish', { message: 'Published to the website ✓' }, [{}, { message: '' }, { message: 7 }]],
  ['POST', '/pages/about/publish', { message: 'Published to the website ✓' }, [{}]],
  ['POST', '/publishes/release-1/restore', { message: 'Published to the website ✓' }, [{}]],
  ['PUT', '/settings', { notifications: { cv: true, msg: false }, signature: '' }, [{}, { signature: '' }]],
  ['POST', '/conversations/c1/replies', { status: 'sent', message: 'Reply sent.' }, [{}, { message: 'Reply sent.' }]],
  ['POST', '/conversations/c1/retry-reply', { mailId: 'm', status: 'queued', message: 'Retry queued.' }, [{}]],
];
const NOT_OBJECTS = [null, [], 'ok', 0, true];
test('writes: the real answer of each operation is accepted, once', async () => {
  for (const [method, path, good] of ROUTES) {
    const c = client([[200, good]]);
    assert.deepEqual(await c.call(method, path, {}), good, `${method} ${path}`);
    assert.equal(c.writes(), 1); assert.equal(c.marks.uncertain, 0);
  }
});
test('writes: {}, null, [] or a missing field after a write is unknown, never sent again', async () => {
  for (const [method, path, , incomplete] of ROUTES) for (const answer of [...incomplete, ...NOT_OBJECTS]) {
    const c = client([[200, answer]]);
    await assert.rejects(c.call(method, path, {}), error => error.unknown === true && error.status === 0 && /result is unknown/.test(error.message), `${method} ${path} ${JSON.stringify(answer)}`);
    assert.equal(c.writes(), 1, 'never sent again'); assert.equal(c.marks.uncertain, 1);
  }
});
test('writes whose success is an empty object still accept one, but not null or a list', async () => {
  for (const [method, path] of [['POST', '/conversations/c1/state'], ['DELETE', '/conversations/c1'], ['POST', '/people'], ['DELETE', '/people/a%40b.c'], ['DELETE', '/items/item-1']]) {
    assert.deepEqual(await client([[200, {}]]).call(method, path, {}), {});
    for (const answer of NOT_OBJECTS) await assert.rejects(client([[200, answer]]).call(method, path, {}), error => error.unknown);
  }
});
test('reading is unchanged: a GET may answer a list, and an unreadable GET is a protocol error, not unknown', async () => {
  assert.deepEqual(await client([[200, []]]).call('GET', '/publishes'), []);
  await assert.rejects(client([[200, '<html>']]).call('GET', '/structure'), error => !error.unknown && error.code === 'protocol');
});
test('server errors stay known failures with their message (422, 409)', async () => {
  for (const [status, message] of [[422, 'Section name: use 1–60 characters.'], [409, 'This page changed in another window. Save it again before publishing.']]) {
    const c = client([[status, { message, code: 'x', diagnostics: [{ field: 'title' }] }]]);
    await assert.rejects(c.call('PUT', '/structure', {}), error => !error.unknown && error.status === status && error.message === message && error.diagnostics.length === 1);
    assert.equal(c.marks.uncertain, 0);
  }
});
const steps = [{ id: 'content', label: 'Checking the content', state: 'done' }];
test('jobs: "done" without its result, or with an incomplete one, is unknown; the write is sent once', async () => {
  for (const [path, good] of [['/structure/publish', { message: 'Published ✓' }], ['/items/item-1/publish', { message: 'Published ✓', item }], ['/publishes/r/restore', { message: 'Published ✓' }]]) {
    const ok = client([[202, { job: { id: 'j' } }], [200, { state: 'done', steps, result: good }]]);
    assert.deepEqual(await ok.track(path, {}, ok.steps), good);
    for (const result of [undefined, null, {}, [], { item }]) {
      const c = client([[202, { job: { id: 'j' } }], [200, { state: 'done', steps, ...(result === undefined ? {} : { result }) }]]);
      await assert.rejects(c.track(path, {}, c.steps), error => error.unknown && /Site history/.test(error.message), `${path} ${JSON.stringify(result)}`);
      assert.equal(c.writes(), 1, 'never sent again'); assert.equal(c.marks.uncertain, 1);
    }
  }
});
test('uploads: a file or photo answer without its id is unknown, directly or through a job', async () => {
  const goodFile = client([[202, { job: { id: 'j' } }], [200, { state: 'done', steps, result: file }]]);
  assert.equal((await goodFile.trackUpload('/files', {}, goodFile.steps)).id, file.id);
  for (const result of [undefined, {}, { ...file, id: 'file-1' }, { ...file, url: '' }]) {
    const c = client([[202, { job: { id: 'j' } }], [200, { state: 'done', steps, ...(result === undefined ? {} : { result }) }]]);
    await assert.rejects(c.trackUpload('/files', {}, c.steps), error => error.unknown && /file may have been added/.test(error.message));
    assert.equal(c.writes(), 1);
  }
  await assert.rejects(client([[200, {}]]).trackUpload('/files', {}, null), error => error.unknown);
  assert.deepEqual(await client([[200, { mediaId: 'm1', src: '/api/v2/media/m1' }]]).upload('/media', {}, null), { mediaId: 'm1', src: '/api/v2/media/m1' });
  for (const answer of [{}, null, [], { mediaId: 'm1' }, { src: '/api/v2/media/m1' }]) {
    const c = client([[200, answer]]);
    await assert.rejects(c.upload('/media', {}, null), error => error.unknown && /file may have been added/.test(error.message));
    assert.equal(c.writes(), 1);
  }
});
// T15: following a long action must not throw the person off the screen they moved to, nor mark that screen's
// unsaved changes as saved. Every re-render or dirty reset after a write is guarded by screenMark().
test('screens: an action that ends after the person moved on leaves the new screen alone', () => {
  assert.match(app, /function main\(\.\.\.children\) \{ shownScreen\+\+;/);
  assert.match(app, /const screenMark = \(\) => \{ const mark = shownScreen; return \(\) => shownScreen === mark; \};/);
  const guarded = ["if(!publishing&&still())openNode(id)", "await publishTree(steps);if(still())openNode(id)", "if (still()) { state.dirty = false; openSection(section.slug).then(() => openItem(item.id)); }",
    "if (still()) openSection(section.slug); }", "if (still()) { state.dirty = false; openSection(section.slug); }", "if (still()) openConversation(id, box, false, true); }",
    "if(still())state.dirty=false;if(siteListShown())await listSite(false);", "if (still()) state.dirty = false; const text = result.message", "data.revision = saved.revision; if (still()) state.dirty = false; return true;"];
  for (const line of guarded) assert.ok(app.includes(line), line);
  // No unguarded re-render right after a write is left.
  assert.doesNotMatch(app, /await (publishTree|call|track)\([^;]*\);\s*openNode\(/);
  assert.doesNotMatch(app, /toast\('(Deleted|Taken off the site) ✓'\); (state\.dirty = false; )?openSection/);
});
