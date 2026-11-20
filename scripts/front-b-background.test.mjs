// B V3 (T19): the B background is a closed choice made in Pond Desk (look_bBackground) and applied by the common
// layout to every page of version B only. These checks read the sources; the real builds are compared in the T19 audit.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFile } from 'node:fs/promises';
import { bBackgroundValues } from '../src/data/home-look.js';
const app = await readFile(new URL('../editor/v2/app.js', import.meta.url), 'utf8');
const layout = await readFile(new URL('../src/layouts/SiteLayout.astro', import.meta.url), 'utf8');
const cream = await readFile(new URL('../src/styles/neo-b-cream.css', import.meta.url), 'utf8');

test('Pond Desk offers exactly the server values, as a choice with a preview, in the home settings', () => {
  const home = app.slice(app.indexOf('  home: {'), app.indexOf('  about: {'));
  const line = home.split('\n').find(text => text.includes("name: 'look_bBackground'"));
  assert.ok(line, 'look_bBackground missing from the home page fields');
  assert.match(line, /type: 'choice'/);
  assert.deepEqual([...line.matchAll(/\['(\w+)', '[^']+', '[^']+'\]/g)].map(match => match[1]), [...bBackgroundValues]);
  assert.match(line, /\(version B\)/, 'the field must be hidden while B is not public');
  assert.match(app, /querySelector\('\[data-images\], \[data-rows\], \[data-file\], \[data-choice\]'\)/, 'readForm must read the choice');
  const control = app.slice(app.indexOf('function choiceControl'), app.indexOf('function imageControl'));
  assert.match(control, /role: 'radiogroup'/); assert.match(control, /type: 'radio'/); assert.match(control, /choice-preview/);
  assert.doesNotMatch(control, /innerHTML|style:/, 'no HTML parsing and no inline style (CSP)');
});

test('the layout applies cream only to version B, after every other style', () => {
  assert.match(layout, /const bBackground = look === 'modern' \? site\.home\.look\.bBackground : null;/);
  assert.match(layout, /data-b-background=\{bBackground \?\? undefined\}/);
  const style = layout.slice(layout.indexOf('<style is:inline'), layout.indexOf('</style>'));
  assert.ok(style.trimEnd().endsWith("(bBackground === 'cream' ? neoBCream : '')}>"), 'cream must be the last style');
  assert.match(cream, /--b-surface:var\(--cream\)/);
});

test('B frog menus: a frog never draws its panel colour nor another frog’s colour; one tongue at a time; Escape closes', async () => {
  const source = await readFile(new URL('../src/scripts/frog-menus-b.js', import.meta.url), 'utf8');
  const listeners = {};
  const el = (attrs = {}) => { const a = new Map(Object.entries(attrs)); const cls = new Set(); const handlers = {}; return {
    hidden: true, getAttribute: k => a.get(k) ?? null, setAttribute: (k, v) => a.set(k, String(v)), classList: { toggle: (c, on) => on ? cls.add(c) : cls.delete(c), contains: c => cls.has(c) },
    addEventListener: (t, f) => { handlers[t] = f; }, fire: t => handlers[t]?.(), focus() {}, contains: () => false }; };
  const menus = ['aero-blue', 'dandelion', 'pink'].map((panel, i) => { const menu = el({ 'data-panel': panel }); const frog = el({ 'data-frog-color': ['dandelion', 'blue-marine', 'aero-blue'][i] }); const button = el(); const tongue = el();
    menu.querySelector = s => s === '.v3-frog' ? frog : s === '.v3-frog-button' ? button : tongue; return { menu, frog, button, tongue }; });
  const document = { querySelectorAll: () => menus.map(m => m.menu), addEventListener: (t, f) => { listeners[t] = f; } };
  new Function('document', source)(document);
  for (let round = 0; round < 400; round++) {
    const m = menus[round % 3];
    m.button.fire('click');
    const colours = menus.map(x => x.frog.getAttribute('data-frog-color'));
    assert.notEqual(m.frog.getAttribute('data-frog-color'), m.menu.getAttribute('data-panel'));
    assert.equal(new Set(colours).size, 3, 'two frogs share a colour');
    assert.equal(menus.filter(x => !x.tongue.hidden).length, 1);
    listeners.keydown({ key: 'Escape' });
    assert.equal(menus.filter(x => !x.tongue.hidden).length, 0);
  }
});
