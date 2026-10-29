import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prepareSiteContent, splitEvents, rubrics } from '../src/data/site-content.js';

const demo = JSON.parse(await readFile(new URL('../src/data/site-content.json', import.meta.url), 'utf8'));
const copy = () => structuredClone(demo);

test('sample content is valid and labeled', () => {
  const site = prepareSiteContent(copy());
  assert.equal(demo.demo, true);
  assert.ok(demo.works.every(item => item.demo === true) && demo.events.every(item => item.demo === true) && demo.press.every(item => item.demo === true));
  for (const slug of [...rubrics.works, ...rubrics.events, ...rubrics.press]) assert.ok([...site.works, ...site.events, ...site.press].some(item => item.rubric === slug), `empty section : ${slug}`);
});
// Sample navigation must stay within the site.
test('sample content has no external links', () => {
  const links = JSON.stringify(demo).match(/https?:\/\/[^"]+/g) || [];
  assert.deepEqual(links, []);
});
for (const [name, change, pattern] of [
  ['unknown section', data => { data.works[0].rubric = 'secret'; }, /unknown rubric/],
  ['non-HTTPS link', data => { data.works[0].link = 'http://example.com'; }, /HTTPS/],
  ['video outside YouTube/Vimeo', data => { data.works[0].video = 'https://evil.test/v'; }, /unsupported host/],
  ['missing image description', data => { data.works[0].image.alt = ''; }, /alt: required/],
  ['unexpected field', data => { data.works[0].html = '<b>x</b>'; }, /unexpected field html/],
  ['direction character', data => { data.press[0].title = 'A‮B'; }, /text of 160/],
  ['invalid date', data => { data.events[0].start = '2026-13-40T99:00'; }, /invalid date/],
  ['missing image', data => { data.works[0].image.mediaId = 'missing-image'; }, /image missing/],
  ['invalid image signature', data => { data.media[0].base64 = Buffer.from('<svg></svg>').toString('base64'); }, /signature/],
  ['duplicate ID', data => { data.press[1].id = data.press[0].id; }, /duplicate identifier/],
]) test(`rejects: ${name}`, () => { const data = copy(); change(data); assert.throws(() => prepareSiteContent(data), pattern); });
test('events: upcoming then past, relative to today', () => {
  const list = [{ start: '2026-01-10T10:00', end: '' }, { start: '2026-12-01T10:00', end: '' }, { start: '2026-10-20T10:00', end: '2026-10-24T18:00' }];
  const { upcoming, past } = splitEvents(list, new Date('2026-10-24T12:00:00Z'));
  assert.deepEqual(upcoming.map(item => item.start), ['2026-12-01T10:00', '2026-10-20T10:00']);
  assert.deepEqual(past.map(item => item.start), ['2026-01-10T10:00']);
});
