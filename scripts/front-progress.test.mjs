// Pond Desk progress card: steps advance only when the action confirms them; Done only after finish();
// an action that stops early shows the step where it stopped, never a success.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const app = readFileSync(new URL('../editor/v2/app.js', import.meta.url), 'utf8');
const block = app.slice(app.indexOf('// progress:start'), app.indexOf('// progress:end'));
const lockBlock = app.slice(app.indexOf('// lock:start'), app.indexOf('// lock:end'));
const text = node => node == null ? '' : typeof node === 'string' ? node : [node.text ?? '', ...(node.kids ?? [])].map(text).join(' ');
function harness() {
  let box = null;
  const h = (tag, attrs = {}, ...kids) => { const node = { tag, ...attrs, dataset: {}, hidden: false, kids: kids.flat().filter(k => k !== null && k !== undefined), replaceChildren(...k) { this.kids = k; } }; if (attrs.id === 'progress') box = node; return node; };
  const toastBox = { hidden: true };
  const context = { h, $: s => s === '#toast' ? toastBox : null, WAIT_TEXT: 'Please wait: the previous action is still running.', setTimeout: () => 0, clearTimeout: () => {}, Math };
  vm.createContext(context); vm.runInContext(block + '\nglobalThis.card = progressCard;', context);
  return Object.assign(context.card, { box: () => box, shown: () => text(box) });
}
test('progress: steps move only on confirmation and Done needs finish()', () => {
  const card = harness();
  const steps = card.start({ title: 'Publishing', steps: ['Saving the draft', 'Building and publishing the site (A and B)'] });
  assert.equal(card.box().dataset.state, 'running'); assert.match(card.shown(), /Step 1 of 2/); assert.match(card.shown(), /In progress…/);
  steps.step(1); assert.match(card.shown(), /Step 2 of 2/); assert.doesNotMatch(card.shown(), /Done/);
  steps.measure(50, 200); assert.match(card.shown(), /25%/);
  steps.finish('Published ✓'); assert.equal(card.box().dataset.state, 'done'); assert.match(card.shown(), /Done/); assert.match(card.shown(), /Published ✓/);
  steps.settle(); assert.equal(card.visible(), true, 'a finished card stays until it closes itself');
});
test('progress: an action that stops after a message fails at its current step, never Done', () => {
  const card = harness(); const steps = card.start({ title: 'Saving', steps: ['Saving the draft'] });
  assert.equal(card.take('Someone else changed the layout.'), true, 'messages during the action go into the card');
  steps.settle(); assert.equal(card.box().dataset.state, 'failed'); assert.match(card.shown(), /Stopped at step 1 of 1/); assert.match(card.shown(), /stopped here/); assert.doesNotMatch(card.shown(), /Done/);
  assert.equal(card.take('Another message'), false, 'after the failure, new messages are separate toasts');
});
test('progress: a cancelled action without any message closes quietly', () => {
  const card = harness(); const steps = card.start({ title: 'Going back', steps: ['Restoring'] });
  steps.settle(); assert.equal(card.visible(), false);
});
test('progress: the waiting notice of a refused second action never counts as a result', () => {
  const card = harness(); const steps = card.start({ title: 'Publishing', steps: ['A', 'B'] });
  steps.fail('Build failed'); assert.equal(card.box().dataset.state, 'failed'); steps.finish('Published ✓'); assert.equal(card.box().dataset.state, 'failed', 'a failure cannot turn into a success');
  const again = card.start({ title: 'Publishing', steps: ['A', 'B'] });
  assert.equal(card.take('Please wait: the previous action is still running.'), false);
  again.settle(); assert.equal(card.visible(), false);
});
test('progress: no timer moves a step and no invented percentage', () => {
  assert.doesNotMatch(block, /setInterval/);
  assert.match(block, /setTimeout\(\(\) => \{ if \(run === ended\) hide\(\); \}, 5000\)/, 'the only timer hides a finished card');
  assert.match(block, /'In progress…'/);
  assert.match(block, /if \(run\?\.state === 'running' && total > 0\)/, 'a percentage needs a real total');
  assert.match(block, /role: 'progressbar'/);
  assert.match(block, /'aria-valuenow': String\(doneCount\)/);
});
test('progress: the shared lock starts the card only for a step plan and fails it on an error', () => {
  assert.match(lockBlock, /typeof waitText === 'object' \? progressCard\.start\(waitText\) : null/);
  assert.match(lockBlock, /if \(steps\) steps\.fail\(text\)/);
  assert.match(lockBlock, /steps\?\.settle\(\)/);
});
test('progress: saves, publications, uploads and restores use step plans', () => {
  for (const pattern of [/writer\(publish, PLAN\.publish\)/, /writer\(saveOnly, PLAN\.save\)/, /save\(true, steps\), PLAN\.publish/, /save\(false, steps\), PLAN\.save/, /PLAN\.publishOnly/, /PLAN\.restore/, /PLAN\.file/, /PLAN\.photo/])
    assert.match(app, pattern);
  assert.match(app, /request\.upload\.onprogress = event => \{ if \(event\.lengthComputable\) steps\?\.measure\(event\.loaded, event\.total\); \}/);
  assert.match(app, /request\.upload\.onload = \(\) => steps\?\.step\(2\)/);
  assert.doesNotMatch(app, /PUBLISHING/);
});
