// Site wording (T8): every one of the 66 texts is read from site.wording in A and B, never written in the page,
// and Pond Desk offers every key with its original text, an empty-means-original rule and the shared lock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { wordingDefaults } from '../src/data/wording.js';

const walk = dir => readdirSync(dir).flatMap(name => { const path = `${dir}/${name}`; return statSync(path).isDirectory() ? walk(path) : [path]; });
const files = [...walk('src/components'), ...walk('src/pages')].filter(path => path.endsWith('.astro'));
const sources = Object.fromEntries(files.map(path => [path, readFileSync(path, 'utf8')]));
const all = Object.values(sources).join('\n');
const app = readFileSync('editor/v2/app.js', 'utf8');

test('each of the 66 texts is read from site.wording by the site', () => {
  assert.equal(Object.keys(wordingDefaults).length, 66);
  for (const key of Object.keys(wordingDefaults)) assert.ok(all.includes(`'${key}'`), `${key} is not used by any page`);
});

test('the original texts are no longer written inside the pages', () => {
  // Sentences that only exist as wording originals; short words such as "Email" or "Video" also appear elsewhere.
  const sentences = Object.values(wordingDefaults).filter(text => text.length > 18 && !/^FROG POND BOYS$/.test(text));
  for (const [path, source] of Object.entries(sources)) for (const text of sentences) assert.ok(!source.includes(text), `${path} still writes “${text}”`);
});

test('texts are inserted as text, never as HTML', () => {
  for (const [path, source] of Object.entries(sources)) if (/wording/.test(source)) assert.doesNotMatch(source, /set:html=\{[^}]*wording/, path);
  const screen = app.slice(app.indexOf('async function openWording'), app.indexOf('// ---------- Space: applications'));
  assert.doesNotMatch(screen, /innerHTML|insertAdjacentHTML/);
});

test('messages written after load follow the wording, with the English original as fallback', () => {
  const forms = readFileSync('src/scripts/inquiry-forms.js', 'utf8'), motion = readFileSync('src/scripts/pond-motion.js', 'utf8');
  for (const name of ['msgMissing', 'msgFileType', 'msgFileEmpty', 'msgFileLarge']) assert.match(forms, new RegExp(`say\\('${name}'`));
  assert.match(motion, /control\.getAttribute\('data-resume'\) \|\| 'Resume motion'/);
  assert.match(motion, /control\.getAttribute\('data-pause'\) \|\| 'Pause motion'/);
  const form = readFileSync('src/components/forms/InquiryForm.astro', 'utf8');
  for (const attribute of ['data-msg-missing', 'data-msg-file-type', 'data-msg-file-empty', 'data-msg-file-large']) assert.ok(form.includes(`'${attribute}'`));
});

test('Pond Desk lists every key, keeps empty as original and saves through the shared lock', () => {
  const screen = app.slice(app.indexOf('const WORDING = ['), app.indexOf('// ---------- Space: applications'));
  for (const key of Object.keys(wordingDefaults)) assert.ok(screen.includes(`'${key}'`), `${key} missing from the Desk screen`);
  assert.match(screen, /'Back to the original'/);
  assert.match(screen, /input\.value = ''/);
  assert.match(screen, /writer\(saveOnly, PLAN\.save\)/);
  assert.match(screen, /writer\(publish, PLAN\.publish\)/);
  assert.match(screen, /call\('PUT', '\/pages\/wording', \{ revision: data\.revision, fields: values\(\) \}\)/);
  assert.match(screen, /error\.status === 409/);
});
