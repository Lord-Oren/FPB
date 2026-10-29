import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { pages, menuPages } from '../src/data/pages.js';

class Element {
  constructor() {
    this.events = {}; this.attributes = {}; this.classes = new Set(); this.style = {};
    this.hidden = true; this.focused = false;
    this.classList = {
      contains: value => this.classes.has(value),
      add: value => this.classes.add(value), remove: value => this.classes.delete(value),
      toggle: (value, state) => state ? this.classes.add(value) : this.classes.delete(value),
    };
  }
  addEventListener(type, fn) { (this.events[type] ??= []).push(fn); }
  emit(type, event = {}) { for (const fn of this.events[type] ?? []) fn(event); }
  setAttribute(key, value) { this.attributes[key] = value; }
  getAttribute(key) { return this.attributes[key]; }
  focus() { this.focused = true; }
}
const script = name => readFileSync(new URL(`../src/scripts/${name}.js`, import.meta.url), 'utf8');
const frogMarkup = readFileSync(new URL('../src/components/pond/Frogs.astro', import.meta.url), 'utf8');
const brandColors = ['aero-blue', 'blue-marine', 'dandelion', 'deep-sea', 'midnight'];
const initialColors = ['aero-blue','dandelion','blue-marine'];
function menus(random = Math.random, colors = initialColors, mode = 'adapted') {
  const frogs = Array.from({ length: 3 }, (_, index) => {
    const frog = new Element(); frog.setAttribute('data-frog-color', colors[index]); frog.button = new Element(); frog.panel = new Element();
    frog.querySelector = selector => selector === '.frog-button' ? frog.button : frog.panel;
    frog.contains = target => target === frog || target === frog.button || target === frog.panel;
    return frog;
  });
  const pond = new Element(); pond.setAttribute('data-artwork-mode', mode);
  const document = new Element(); document.querySelectorAll = () => frogs; document.querySelector = () => pond;
  runInNewContext(script('frog-menus'), { document, Math: { random } });
  return { document, frogs };
}
test('menus open links, close other menus and toggle on a second click', () => {
  const { frogs: [first, second] } = menus();
  first.button.emit('click');
  assert.equal(first.panel.hidden, false); assert.equal(first.button.getAttribute('aria-expanded'), 'true');
  second.button.emit('click');
  assert.equal(first.panel.hidden, true); assert.equal(first.button.getAttribute('aria-expanded'), 'false');
  assert.equal(second.panel.hidden, false);
  second.button.emit('click'); assert.equal(second.panel.hidden, true);
});
test('Escape closes the menu and returns focus to its button', () => {
  const { document, frogs: [first] } = menus();
  first.button.emit('click'); document.emit('keydown', { key: 'Escape' });
  assert.equal(first.panel.hidden, true); assert.equal(first.button.focused, true);
});
test('clicks and focus inside preserve the menu; outside closes it', () => {
  const { document, frogs: [first] } = menus();
  first.button.emit('click');
  document.emit('click', { target: { closest: () => first } });
  document.emit('focusin', { target: first.panel }); assert.equal(first.panel.hidden, false);
  document.emit('click', { target: { closest: () => null } }); assert.equal(first.panel.hidden, true);
  first.button.emit('click'); document.emit('focusin', { target: new Element() }); assert.equal(first.panel.hidden, true);
});
test('pause follows system preferences and then visitor choice', () => {
  const control = new Element(), pond = new Element(), body = new Element(), preference = new Element();
  preference.matches = true;
  const document = { body, querySelector: selector => selector === '.motion-toggle' ? control : pond };
  runInNewContext(script('pond-motion'), { document, window: { matchMedia: () => preference } });
  assert.equal(control.hidden, false); assert.equal(control.getAttribute('aria-pressed'), 'true');
  assert.equal(pond.classList.contains('motion-paused'), true);
  control.emit('click'); assert.equal(pond.classList.contains('motion-paused'), false);
  control.emit('click'); assert.equal(body.classList.contains('motion-paused'), true);
  preference.emit('change', { matches: false }); assert.equal(control.getAttribute('aria-pressed'), 'false');
});
test('cursor tracks coordinates and restores the normal pointer on exit', () => {
  const fly = new Element(), body = new Element(), html = new Element(), pointer = new Element(), window = new Element();
  pointer.matches = true; window.matchMedia = () => pointer;
  runInNewContext(script('fly-cursor'), { document: { body, documentElement: html, querySelector: () => fly }, window });
  assert.equal(body.classList.contains('fly-cursor-active'), false);
  window.emit('mousemove', { clientX: 490, clientY: 122 });
  assert.equal(fly.style.transform, 'translate(490px, 122px) translate(-50%, -50%)');
  window.emit('mousemove', { clientX: 12, clientY: 35 });
  assert.equal(fly.style.transform, 'translate(12px, 35px) translate(-50%, -50%)');
  html.emit('mouseleave'); assert.equal(body.classList.contains('fly-cursor-active'), false);
  pointer.matches = false; window.emit('mousemove', { clientX: 55, clientY: 60 });
  assert.equal(body.classList.contains('fly-cursor-active'), false);
});
test('client navigation keeps legacy URLs but hides retired sections', () => {
  const frogs = readFileSync(new URL('../src/components/pond/Frogs.astro', import.meta.url), 'utf8');
  const visible = ['Advertising','Creative','PR'].flatMap(menuPages);
  assert.equal(new Set(pages.map(p=>p.slug)).size,pages.length);
  assert(visible.every(p=>!p.hidden));
  for(const old of ['music','presentations','media-relations','influencer-relations','events-launches']) assert(pages.some(p=>p.slug===old&&p.hidden));
  for(const group of ['Advertising','Creative','PR']) assert.deepEqual(menuPages(group).map(p=>p.title),menuPages(group).map(p=>p.title).sort((a,b)=>a.localeCompare(b,'en')));
  assert(frogs.includes('childNodes(node.id)'));
  assert.equal([...frogs.matchAll(/aria-expanded="false"/g)].length, 1);
  for (const [, id] of frogs.matchAll(/aria-controls="([^"]+)"/g)) {
    assert(frogs.includes(`id="${id}" hidden`));
  }
});

test('adapted presentation has three distinct initial colors', () => {
  assert.equal(initialColors.length, 3);
  assert.equal(new Set(initialColors).size, 3);
  for (const color of initialColors) assert(brandColors.includes(color));
});

test('3000 openings: distinct colors, individual changes and no global repetition', () => {
  let seed = 246813579;
  const seeded = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (const random of [() => 0, () => 0.999999, seeded]) {
    let draws = 0;
    const { frogs } = menus(() => { draws++; return random(); });
    let last = null;
    const order = [0, 1, 0, 2, 2, 0, 1];
    for (let step = 0; step < 1000; step++) {
      const frog = frogs[order[step % order.length]];
      if (frog.classList.contains('open')) frog.button.emit('click');
      const before = frogs.map(item => item.getAttribute('data-frog-color'));
      frog.button.emit('click');
      const next = frog.getAttribute('data-frog-color');
      assert(!before.includes(next));
      assert.notEqual(next, last);
      assert.equal(new Set(frogs.map(item => item.getAttribute('data-frog-color'))).size, 3);
      assert.equal(draws, step + 1, 'exactly one random draw per opening');
      for (let index = 0; index < frogs.length; index++) {
        if (frogs[index] !== frog) assert.equal(frogs[index].getAttribute('data-frog-color'), before[index]);
      }
      last = next;
    }
  }
});

test('closing preserves color without consuming a random draw', () => {
  let draws = 0;
  const { document, frogs: [a, b, c] } = menus(() => { draws++; return 0; });
  a.button.emit('click');
  const first = a.getAttribute('data-frog-color');
  a.button.emit('click');
  assert.equal(a.getAttribute('data-frog-color'), first);
  assert.equal(draws, 1);
  a.button.emit('click');
  const second = a.getAttribute('data-frog-color');
  assert.notEqual(second, first);
  document.emit('keydown', { key: 'Escape' });
  assert.equal(draws, 2); assert.equal(a.getAttribute('data-frog-color'), second);
  b.button.emit('click');
  const third = b.getAttribute('data-frog-color');
  assert.notEqual(third, second);
  document.emit('click', { target: { closest: () => null } });
  document.emit('focusin', { target: new Element() });
  assert.equal(draws, 3); assert.equal(b.getAttribute('data-frog-color'), third);
  c.button.emit('click');
  assert.equal(draws, 4); assert.notEqual(c.getAttribute('data-frog-color'), third);
});

test('Deep Sea is excluded while assigned to a frog, then becomes available again', () => {
  const { frogs: [a, b, c] } = menus(() => 0.999999);
  a.button.emit('click'); assert.equal(a.getAttribute('data-frog-color'), 'deep-sea');
  b.button.emit('click'); assert.notEqual(b.getAttribute('data-frog-color'), 'deep-sea');
  c.button.emit('click'); assert.notEqual(c.getAttribute('data-frog-color'), 'deep-sea');
  a.button.emit('click'); assert.notEqual(a.getAttribute('data-frog-color'), 'deep-sea');
  b.button.emit('click'); assert.equal(b.getAttribute('data-frog-color'), 'deep-sea');
});

test('each frog can draw the five available brand colors, with Deep Sea rare', () => {
  // Sweep uniform inputs over complementary starting states without flaky randomness.
  for (let frogIndex = 0; frogIndex < 3; frogIndex++) {
    const seen = new Set();
    for (const starting of [initialColors, ['blue-marine', 'midnight', 'deep-sea'], ['aero-blue', 'midnight', 'deep-sea']]) {
      const counts = new Map();
      for (let sample = 0; sample < 256; sample++) {
        const { frogs } = menus(() => (sample + 0.5) / 256, starting);
        const frog = frogs[frogIndex]; frog.button.emit('click');
        const color = frog.getAttribute('data-frog-color');
        assert(!starting.includes(color)); seen.add(color);
        counts.set(color, (counts.get(color) ?? 0) + 1);
      }
      if (starting.includes('deep-sea')) assert.equal(counts.get('deep-sea'), undefined);
      else {
        assert(counts.get('deep-sea') > 0 && counts.get('deep-sea') / 256 < 0.02);
        for (const [color, count] of counts) if (color !== 'deep-sea') assert(count > counts.get('deep-sea') * 20);
      }
    }
    assert.deepEqual([...seen].sort(), brandColors);
  }
});


test('all brand distributions allow a distinct change at random boundaries', () => {
  for (const a of brandColors) for (const b of brandColors) for (const c of brandColors) {
    const starting = [a, b, c];
    if (new Set(starting).size !== 3) continue;
    for (let index = 0; index < 3; index++) for (const random of [0, 0.999999]) {
      const { frogs } = menus(() => random, starting);
      frogs[index].button.emit('click');
      const drawn = frogs[index].getAttribute('data-frog-color');
      assert(brandColors.includes(drawn));
      assert(!starting.includes(drawn));
      assert.equal(new Set(frogs.map(frog => frog.getAttribute('data-frog-color'))).size, 3);
    }
  }
});

test('original artwork retains colors without random draws, with navigation and closing active', () => {
  const { document, frogs } = menus(() => { throw new Error('No colour draw in original mode'); }, initialColors, 'original');
  for (const frog of frogs) {
    frog.button.emit('click');
    assert.equal(frog.panel.hidden, false);
    assert.equal(frog.button.getAttribute('aria-expanded'), 'true');
    for (const other of frogs) if (other !== frog) assert.equal(other.panel.hidden, true);
  }
  document.emit('keydown', { key: 'Escape' });
  assert.equal(frogs[2].panel.hidden, true);
  assert.equal(frogs[2].button.focused, true);
  assert.deepEqual(frogs.map(frog => frog.getAttribute('data-frog-color')), initialColors);
  frogs[0].button.emit('click');
  document.emit('click', { target: { closest: () => null } });
  assert.equal(frogs[0].panel.hidden, true);
});
