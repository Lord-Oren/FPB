// T23 (T22-F01 / T22-F02): readability rules of version B that older stylesheets used to override.
// The real-browser checks with representative members and projects are in the T23 audit; these lock the CSS in place.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFile } from 'node:fs/promises';
const css = await readFile(new URL('../src/styles/b-v3.css', import.meta.url), 'utf8');
const tablet = css.slice(css.indexOf('@media (max-width:980px)'), css.indexOf('/* Phone */'));

test('team names and roles stay dark on the cream cards (home and About)', () => {
  assert.match(css, /\.hm-people b \{ color:var\(--midnight\)/);
  assert.match(css, /\.hm-people span \{ color:var\(--midnight\)/);
  assert.match(css, /\.content-page \.about-team \.team-member \{ background:var\(--cream\); color:var\(--midnight\)/);
});

test('Recent cards: the B grid owns the tiles and the caption is never cut off', () => {
  assert.match(css, /\.hm-mosaic \.hm-tile, \.hm-ribbit-grid \.hm-tile \{ height:auto; min-height:0; flex:none; scroll-snap-align:none \}/);
  assert.match(css, /grid-auto-rows:minmax\(220px,auto\)/, 'desktop rows grow with a long caption');
  assert.match(tablet, /\.hm-mosaic \{ display:grid; grid-auto-rows:auto; overflow:visible; scroll-snap-type:none; margin:0; padding:0 \}/);
  assert.match(tablet, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, 'wide images must not widen the grid');
  assert.match(tablet, /\.home-more \{ grid-template-columns:minmax\(0,1fr\) \}/);
  assert.match(tablet, /aspect-ratio:4 \/ 3/); assert.match(tablet, /aspect-ratio:16 \/ 9/);
  assert.doesNotMatch(css.match(/\.hm-mosaic:not\(\.hm-ribbit-grid\)[^{]*\{[^}]*\}/g).join(''), /hm-ribbit-grid \.hm-tile img/, 'Ribbit squares keep their own size');
});
