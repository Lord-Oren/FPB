// B V3: the B background (Standard / Cream) is chosen by each visitor with the switch in the B header and kept in
// their browser only. Pond Desk no longer shows the setting (decision of the owner, 20 Nov 2026); the server value
// look_bBackground stays valid and only sets the starting value (standard by default). Version A is never affected.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFile } from 'node:fs/promises';
const app = await readFile(new URL('../editor/v2/app.js', import.meta.url), 'utf8');
const layout = await readFile(new URL('../src/layouts/SiteLayout.astro', import.meta.url), 'utf8');
const header = await readFile(new URL('../src/components/b/BHeader.astro', import.meta.url), 'utf8');
const cream = await readFile(new URL('../src/styles/neo-b-cream.css', import.meta.url), 'utf8');
const early = await readFile(new URL('../src/scripts/b-background-early.js', import.meta.url), 'utf8');
const toggle = await readFile(new URL('../src/scripts/b-background.js', import.meta.url), 'utf8');

test('Pond Desk no longer offers the B background: the visitor chooses it', () => {
  assert.doesNotMatch(app, /look_bBackground/);
});

test('the layout loads the scoped cream style last, and both switch scripts, on version B only', () => {
  assert.match(layout, /const bBackground = look === 'modern' \? site\.home\.look\.bBackground : null;/);
  assert.match(layout, /data-b-background=\{bBackground \?\? undefined\}/);
  const style = layout.slice(layout.indexOf('<style is:inline'), layout.indexOf('</style>'));
  assert.ok(style.trimEnd().endsWith("(look === 'modern' ? neoBCream : '')}>"), 'cream must be the last style');
  assert.match(layout, /<title>\{title\}<\/title>\{look === 'modern' && <script is:inline set:html=\{bBackgroundEarly\}><\/script>\}/, 'applied in the head, before paint');
  assert.match(layout, /\{look === 'modern' && <script is:inline set:html=\{bBackgroundSwitch\}><\/script>\}/);
  for (const rule of cream.split('}').filter(x => x.includes('{'))) assert.match(rule, /\[data-b-background=cream\]/, 'every cream rule is scoped');
  assert.match(cream, /--b-surface:var\(--cream\)/);
  assert.match(header, /data-bg-switch hidden/, 'hidden without JavaScript');
  assert.match(header, /data-bg="standard"/); assert.match(header, /data-bg="cream"/);
});

const stubDocument = (stored, initial) => {
  const attrs = new Map(initial ? [['data-b-background', initial]] : []);
  const root = { getAttribute: k => attrs.get(k) ?? null, setAttribute: (k, v) => attrs.set(k, String(v)) };
  const button = value => { const a = new Map([['data-bg', value]]); const h = {}; return { getAttribute: k => a.get(k) ?? null, setAttribute: (k, v) => a.set(k, String(v)), addEventListener: (t, f) => { h[t] = f; }, click: () => h.click() }; };
  const buttons = [button('standard'), button('cream')]; const group = { hidden: true };
  const store = new Map(stored === undefined ? [] : [['fpb-b-background', stored]]);
  const localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const document = { documentElement: root, querySelectorAll: s => s === '[data-bg]' ? buttons : s === '[data-bg-switch]' ? [group] : [] };
  return { root, buttons, group, store, document, localStorage };
};

test('the early script applies only a known stored value', () => {
  for (const [stored, expected] of [['cream', 'cream'], ['standard', 'standard'], ['red', 'standard'], ['</style>', 'standard'], [undefined, 'standard']]) {
    const d = stubDocument(stored, 'standard');
    new Function('document', 'localStorage', early)(d.document, d.localStorage);
    assert.equal(d.root.getAttribute('data-b-background'), expected);
  }
  const d = stubDocument('cream', 'standard');
  assert.doesNotThrow(() => new Function('document', 'localStorage', early)(d.document, { getItem() { throw new Error('blocked'); } }));
});

test('the switch shows itself, marks the pressed button and remembers the choice', () => {
  const d = stubDocument(undefined, 'standard');
  new Function('document', 'localStorage', toggle)(d.document, d.localStorage);
  assert.equal(d.group.hidden, false);
  assert.deepEqual(d.buttons.map(b => b.getAttribute('aria-pressed')), ['true', 'false']);
  d.buttons[1].click();
  assert.equal(d.root.getAttribute('data-b-background'), 'cream'); assert.equal(d.store.get('fpb-b-background'), 'cream');
  assert.deepEqual(d.buttons.map(b => b.getAttribute('aria-pressed')), ['false', 'true']);
  d.buttons[0].click();
  assert.equal(d.root.getAttribute('data-b-background'), 'standard'); assert.equal(d.store.get('fpb-b-background'), 'standard');
  const blocked = stubDocument(undefined, 'cream');
  new Function('document', 'localStorage', toggle)(blocked.document, { setItem() { throw new Error('blocked'); } });
  assert.doesNotThrow(() => blocked.buttons[0].click()); assert.equal(blocked.root.getAttribute('data-b-background'), 'standard');
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
