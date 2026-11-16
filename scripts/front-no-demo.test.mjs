// No demonstration content (V1, 16 November 2026): the built public site, in both variants, and Pond Desk
// must not show demo, sample, made-up or placeholder content. Same words as scripts/back-no-demo.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { buildVariant, project } from './front-build.mjs';

const forbidden = /example\.(com|org|net)|\bdemo\b|\bsample\b|\blorem\b|\bfictional\b|made-up|demo-(band|note|socials)|isDemo/i;
const textFile = /\.(html|css|js|mjs|json|txt|xml|svg)$/;

async function filesIn(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesIn(full) : [full];
  }));
  return nested.flat();
}
function hits(name, text) {
  return text.split('\n').flatMap((line, index) => {
    const match = line.match(forbidden);
    return match ? [`${name}:${index + 1} “${line.slice(Math.max(0, match.index - 40), match.index + 40).trim()}”`] : [];
  });
}
async function scan(dir, base = dir) {
  const files = (await filesIn(dir)).filter(file => textFile.test(file));
  const found = [];
  for (const file of files) found.push(...hits(path.relative(base, file), await readFile(file, 'utf8')));
  return { count: files.length, found };
}

for (const variant of ['a', 'b']) {
  test(`built site ${variant.toUpperCase()} shows no demo, sample or placeholder content`, { timeout: 180000 }, async () => {
    const out = await buildVariant(variant, 'fpb-nodemo');
    try {
      const { count, found } = await scan(out);
      assert(count > 10, `only ${count} files were built`);
      assert.deepEqual(found, []);
    } finally { await rm(out, { recursive: true, force: true }); }
  });
}

test('Pond Desk has no demo store, banner or sample wording', async () => {
  const { count, found } = await scan(path.join(project, 'editor/v2'), project);
  assert(count >= 3);
  assert.deepEqual(found, []);
  const app = await readFile(path.join(project, 'editor/v2/app.js'), 'utf8');
  assert.doesNotMatch(app, /state\.demo|\bDemo\s*=|demoAllowed/);
});
