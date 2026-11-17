// Lily-pad screen message: optional, 14 characters (what always fits the smallest TV glass at 10px or more) as a reader counts them (spaces included), plain text, A and B.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const app = readFileSync(new URL('../editor/v2/app.js', import.meta.url), 'utf8');
const screen = readFileSync(new URL('../src/components/pond/ZoneScreen.astro', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/screen-message.css', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../src/layouts/SiteLayout.astro', import.meta.url), 'utf8');
const helpers = app.slice(app.indexOf('const SCREEN_MESSAGE_MAX='), app.indexOf('function openNode(id){'));
const context = { Intl }; vm.createContext(context); vm.runInContext(helpers + '\nglobalThis.chars=screenChars;globalThis.problem=screenMessageProblem;', context);
test('screen message: the Desk counts characters as readers see them, spaces included', () => {
  assert.equal(context.chars('Fresh work from the pond'), 24);
  assert.equal(context.chars('🐸'.repeat(14)), 14, 'an emoji counts once');
  assert.equal(context.chars('👨‍👩‍👧 é'), 3, 'a family emoji and an accented letter count once each');
  assert.equal(context.chars('é'), 1, 'a letter with a combining accent counts once');
  assert.equal(context.problem('x'.repeat(14)), '');
  assert.equal(context.problem('🐸'.repeat(14)), '');
  assert.equal(context.problem('  ' + 'x'.repeat(14) + '  '), '', 'outer spaces are removed on save');
  assert.match(context.problem('x'.repeat(15)), /Up to 14 characters, spaces included\. Remove 1 character\./);
  assert.match(context.problem('y'.repeat(60)), /Remove 46 characters\./);
  for (const bad of ['two\nlines', 'tab\there', 'a b', 'a‮b']) assert.equal(context.problem(bad), 'Use plain text on one line.');
  assert.equal(context.problem(''), '', 'empty is allowed');
});
test('screen message: Desk field only on lily-pad screens, counter visible, nothing sent when unused', () => {
  const node = app.slice(app.indexOf('function openNode(id){'), app.indexOf('async function openSection('));
  assert.match(node, /node\.zone==='screens'\?h\('input'/);
  assert.match(node, /'Screen message ',h\('span',\{class:'opt',text:'\(optional\)'\}\)/);
  assert.match(node, /length\+'\/'\+SCREEN_MESSAGE_MAX/);
  assert.match(node, /if\(!messageOk\(\)\)\{message\?\.focus\(\);return false;\}/, 'a message over the limit is never sent');
  assert.match(node, /if\(message&&\(message\.value\.trim\(\)\|\|'message' in edited\)\)edited\.message=message\.value\.trim\(\);/);
  assert.doesNotMatch(node, /maxlength:60,/, 'the browser limit counts code units, not characters: the counter and the check do');
});
test('screen message: rendered as escaped text inside the screen, arrow and link kept, empty means arrow only', () => {
  assert.doesNotMatch(screen, /set:html/);
  assert.match(screen, /\{message&&<p class="screen-message">\{message\}/);
  assert.match(screen, /class=\{message\?'screen-content has-message':'screen-content'\}/);
  assert.match(screen, /<a class="screen-link" href=\{href\} tabindex="-1" aria-hidden="true"/);
  assert.match(screen, /typeof node\.message==='string'\?node\.message\.trim\(\):''/, 'older publications without the field show the arrow only');
  assert.match(layout, /\(pond \? screenMessage : ''\)/, 'both designs load the same rules');
  assert.doesNotMatch(css, /text-overflow|line-clamp/, 'the message is never cut');
  assert.match(css, /overflow-wrap:anywhere/);
  // Container queries only widen a small B pad's TV (T12); none moves the text box past the glass onto the frame.
  for (const [, body] of css.matchAll(/@container[^{]*\{([^{}]*\{[^}]*\})\s*\}/g)) assert.match(body, /^\s*\.variant-b \.pad:has\(\.has-message\) \.pad-body \{ width:100% \}\s*$/, 'the text never grows over the TV frame');
  assert.equal((css.match(/@container/g) || []).length, 2);
  assert.match(css, /font-size:clamp\(10px, /, 'never smaller than 10px');
  assert.match(app, /const SCREEN_MESSAGE_MAX=14;/);
});
