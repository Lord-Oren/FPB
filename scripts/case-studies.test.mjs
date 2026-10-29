import test from 'node:test';
import assert from 'node:assert/strict';
import { preparePublicCases, caseStudyHref } from '../src/data/case-studies.js';
import { snapshotFixture } from './fixtures/case-studies.mjs';

test('empty snapshot generates no invented case', () => {
  assert.deepEqual(preparePublicCases({ schemaVersion: 1, cases: [], media: [] }), []);
});
test('public snapshot keeps explicit order and produces independent values', () => {
  const fixture = snapshotFixture();
  const second = structuredClone(fixture.cases[0]); second.id = 'second'; second.slug = 'second';
  fixture.cases.unshift(second);
  const cases = preparePublicCases(fixture);
  assert.deepEqual(cases.map(item => item.href), ['case-study-second.html', 'case-study-synthetic-one.html']);
  cases[0].cover.alt = 'changed';
  assert.equal(fixture.cases[0].content.cover.alt, 'Synthetic test pixel');
});
for (const status of ['draft', 'withdrawn', undefined]) test(`rejects non-public status ${status}`, () => {
  const fixture = snapshotFixture(); fixture.cases[0].status = status;
  assert.throws(() => preparePublicCases(fixture), /explicitly published/);
});
for (const slug of ['../contact', 'index.html', 'x/y', '%2e%2e', 'X', '', 'x?draft=1', 'x#y']) {
  test(`rejects unsafe route ${slug}`, () => assert.throws(() => caseStudyHref(slug), /identifier/));
}
for (const field of ['draft', 'email', 'cv', 'privateNotes', 'html']) test(`rejects unexpected field ${field}`, () => {
  const fixture = snapshotFixture(); fixture.cases[0].content[field] = 'private';
  assert.throws(() => preparePublicCases(fixture), /Unexpected field/);
});
test('rejects duplicate routes and identifiers', () => {
  const fixture = snapshotFixture(); fixture.cases.push(structuredClone(fixture.cases[0]));
  assert.throws(() => preparePublicCases(fixture), /Duplicate case/);
  fixture.cases[1].id = 'different';
  assert.throws(() => preparePublicCases(fixture), /Duplicate case/);
});
test('requires complete content and informative alt text', () => {
  for (const field of ['title', 'summary', 'context', 'work']) {
    const fixture = snapshotFixture(); fixture.cases[0].content[field] = ' ';
    assert.throws(() => preparePublicCases(fixture), /Required public text/);
  }
  const fixture = snapshotFixture(); fixture.cases[0].content.cover.alt = '';
  assert.throws(() => preparePublicCases(fixture), /Required public text/);
});
test('requires referenced public media, rejects duplicate assets and URLs', () => {
  const fixture = snapshotFixture(); fixture.media = [];
  assert.throws(() => preparePublicCases(fixture), /Missing public image/);
  const duplicate = snapshotFixture(); duplicate.media.push(duplicate.media[0]);
  assert.throws(() => preparePublicCases(duplicate), /Duplicate media/);
  const url = snapshotFixture(); url.cases[0].content.cover.src = 'https://example.com/private';
  assert.throws(() => preparePublicCases(url), /Unexpected field/);
});
test('rejects active image formats, invalid bytes and mismatched signatures', () => {
  for (const mime of ['image/svg+xml', 'text/html', 'image/jpeg', 'image/webp']) {
    const fixture = snapshotFixture(); fixture.media[0].mime = mime;
    assert.throws(() => preparePublicCases(fixture), /image type|signature/);
  }
  for (const base64 of ['', 'AAAA', '!!!!', 'data:image/png;base64,AAAA']) {
    const fixture = snapshotFixture(); fixture.media[0].base64 = base64;
    assert.throws(() => preparePublicCases(fixture), /image|Image/);
  }
});
test('rejects oversize input and control characters', () => {
  const fixture = snapshotFixture(); fixture.cases[0].content.title = 'a'.repeat(20001);
  assert.throws(() => preparePublicCases(fixture), /Invalid public text/);
  fixture.cases[0].content.title = '\u0000';
  assert.throws(() => preparePublicCases(fixture), /Invalid public text/);
  fixture.cases[0].content.title = 'Valid'; fixture.media[0].base64 = 'a'.repeat(7 * 1024 * 1024 + 1);
  assert.throws(() => preparePublicCases(fixture), /build limit/);
});
test('preserves HTML-like text for escaping by Astro, not raw HTML rendering', () => {
  const fixture = snapshotFixture(); fixture.cases[0].content.title = '<img src=x onerror=alert(1)>';
  assert.equal(preparePublicCases(fixture)[0].title, fixture.cases[0].content.title);
});

for (const [field, limit] of [['title',90],['summary',240],['context',4000],['work',4000],['client',90],['results',1500]]) {
  test(`contextual ${field} limit`, () => { const fixture = snapshotFixture(); fixture.cases[0].content[field] = 'a'.repeat(limit + 1); assert.throws(() => preparePublicCases(fixture), new RegExp(`synthetic-one.*${field}`)); });
}
test('rejects invisible direction characters', () => { const fixture = snapshotFixture(); fixture.cases[0].content.title = 'test\u202e'; assert.throws(() => preparePublicCases(fixture), /text/); });
test('limits galleries to twelve images', () => { const fixture = snapshotFixture(); fixture.cases[0].content.gallery = Array(13).fill(fixture.cases[0].content.cover); assert.throws(() => preparePublicCases(fixture), /gallery/); });

test('decodes real images and rejects truncated files', async () => {
  const { validatePublicMedia } = await import('../src/data/validate-public-media.js');
  const fixture = snapshotFixture(); await validatePublicMedia(fixture);
  fixture.media[0].base64 = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
  await assert.rejects(validatePublicMedia(fixture), /Media test-pixel/);
});

test('public gallery errors identify the record and image',()=>{const fixture=snapshotFixture();fixture.cases[0].content.gallery=[{...fixture.cases[0].content.cover,alt:''}];assert.throws(()=>preparePublicCases(fixture),/synthetic-one: gallery\[1\].*alt/);});
