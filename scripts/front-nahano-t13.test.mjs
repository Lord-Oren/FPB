// T13 — client feedback of 17 November 2026 (Nahano): footer logos and networks, alphabetical lily pads, Magazine
// inside Photography, Contact with "Write to us" only, team photos in Pond Desk, phone pond like the computer one.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync, existsSync} from 'node:fs';
import {networkOf, NETWORK_HOSTS, NETWORK_NAMES} from '../src/components/social-network.js';
import {screenOrder} from '../src/components/pond/screen-order.js';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const app = read('editor/v2/app.js');
test('footer: the icon follows the address, the Desk uses the same table', () => {
  assert.equal(networkOf('https://x.com/frogpondboys', 'footer-instagram'), 'x');
  assert.equal(networkOf('https://www.linkedin.com/company/frog-pond-boys', 'footer-youtube'), 'linkedin');
  assert.equal(networkOf('https://m.youtube.com/@fpb', 'footer-vimeo'), 'youtube');
  assert.equal(networkOf('https://example.com/', 'footer-instagram'), 'instagram', 'unknown address: the slot keeps its icon');
  assert.equal(networkOf('legal.html', 'footer-legal'), '', 'Legal has no icon');
  assert.equal(networkOf('https://notx.com/', ''), '', 'a look-alike host is not X');
  const context = {}; vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf('const NETWORK_HOSTS='), app.indexOf('function openNode(id)')) + '\nglobalThis.t={NETWORK_HOSTS,NETWORK_NAMES,networkOf};', context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.t.NETWORK_HOSTS)), NETWORK_HOSTS);
  assert.deepEqual(JSON.parse(JSON.stringify(context.t.NETWORK_NAMES)), NETWORK_NAMES);
  const icons = read('src/components/SocialIcon.astro');
  for (const network of Object.keys(NETWORK_NAMES)) assert.match(icons, new RegExp(`"${network}": "M`), `${network} has an icon`);
});
test('footer: the logos chosen by the client, on the left', () => {
  const footer = read('src/components/Footer.astro');
  assert.match(footer, /faceLogo[\s\S]*badgeLogo[\s\S]*secondaryLogo/);
  assert.doesNotMatch(footer, /wordmark|mainLogo/);
  for (const file of ['face.webp', 'badge-green.webp']) assert.ok(existsSync(new URL('../src/assets/logos/' + file, import.meta.url)));
  assert.match(read('src/styles/client-meeting.css'), /footer \.footer-logos\{margin-right:auto\}/);
  assert.match(read('src/styles/client-meeting.css'), /footer \.footer-logos\{flex-basis:100%;justify-content:flex-start\}/);
  assert.doesNotMatch(read('src/styles/mobile-a.css'), /footer-logos\{flex-basis:100%;justify-content:center\}/, 'phones too');
});
test('lily pads: alphabetical by name, punctuation and case ignored, on A, B and in the Desk', () => {
  const nodes = [{ id: 'announcements', title: 'Announcements' }, { id: 'recents', title: 'Recent.' }, { id: 'gram', title: 'Ribbit.' }, { id: 'croak', title: 'croak' }];
  assert.deepEqual(screenOrder(nodes).map(n => n.id), ['announcements', 'croak', 'recents', 'gram']);
  for (const file of ['src/components/pond/LilyScreens.astro', 'src/components/pond/PondB.astro']) assert.match(read(file), /screenOrder\(zoneNodes\('screens'\)\)/);
  assert.match(app, /if\(zone\.id==='screens'\)roots\.sort\(byScreenName\)/);
});
test('Magazine sits inside Photography; Contact keeps only "Write to us"', () => {
  const works = read('src/components/content/Works.astro');
  assert.match(works, /rubric === 'photography' \? site\.works\.filter\(item => item\.rubric === 'magazine'\)/);
  const contact = read('src/components/pages/contact.astro');
  assert.doesNotMatch(contact, /contact-channels|socialTitle|direct-email/);
  assert.match(contact, /id="write-us"/);
  assert.doesNotMatch(app, /name: 'socialTitle'|name: 'socialText'/);
});
test('About: a photo per person in the Desk, sent as { mediaId, alt } or null, and "The Frogs" by default', () => {
  assert.match(app, /name: 'team', label: 'The team', type: 'rows', photo: true/);
  assert.match(app, /box\.read = name => photo \? \{ mediaId: photo\.mediaId, alt: photo\.alt \|\| \(name \? `Photo of \$\{name\}` : ''\) \} : null;/);
  assert.match(read('src/components/pages/about.astro'), /a\.teamTitle \|\| 'The Frogs'/);
});
test('phone pond (A): computer drawings for pads and TVs, floating pads, visible tongue', () => {
  const css = read('src/styles/pond-mobile-a.css');
  assert.doesNotMatch(css, /--pm-pad|--pm-tv/);
  assert.match(css, /prefers-reduced-motion:no-preference[\s\S]*\.lily-screen\{animation:floatPadA/);
  assert.doesNotMatch(read('src/styles/mobile-a.css'), /\.tongue::before,\.home-page \.tongue::after\{display:none\}/);
});
