// Variant isolation guard: Ruben's pixel version (A) and our modern version (B) must not leak into
// each other. Builds both variants into temporary folders and inspects every page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
async function build(variant) {
  const out = await mkdtemp(path.join(tmpdir(), `fpb-${variant}-`));
  const run = spawnSync(process.execPath, [path.join(project, 'node_modules/astro/bin/astro.mjs'), 'build', '--outDir', out], { cwd: project, env: { ...process.env, FPB_VARIANT: variant, ASTRO_TELEMETRY_DISABLED: '1' }, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const pages = (await readdir(out)).filter(name => name.endsWith('.html'));
  return { out, pages: await Promise.all(pages.map(async name => ({ name, html: await readFile(path.join(out, name), 'utf8') }))) };
}
const sameSiteLink = /href="(https?:\/\/[^"]*(fpb-b|fpb-a|127\.0\.0\.1|localhost)[^"]*)"/;
// Placeholder domains must never be clickable (the owner landed on a "domain for documentation examples" page),
// and every internal page a link names must exist in the build.
const placeholderLink = /href="https?:\/\/([^"\/]*\.)?example\.(com|org|net)\b/;
function brokenPages(pages) {
  const names = new Set(pages.map(page => page.name));
  return pages.flatMap(({ name, html }) => [...html.matchAll(/href="([a-z0-9-]+\.html)(#[^"]*)?"/g)].filter(match => !names.has(match[1])).map(match => `${name} → ${match[1]}`));
}

test('A (pixel) never loads B styles or links to B', { timeout: 120000 }, async () => {
  const { out, pages } = await build('a');
  try {
    assert.ok(pages.length >= 19);
    for (const { name, html } of pages) {
      assert.match(html, /data-skin="pixel"/, `${name}: A must use the pixel skin`);
      assert.doesNotMatch(html, /class="[^"]*\bvariant-b\b/, `${name}: B home layout in A`);
      assert.doesNotMatch(html, /--b-surface:/, `${name}: neo-brutalist B theme in A`);
      assert.doesNotMatch(html, /--hm-max:/, `${name}: B home-section styles in A`);
      assert.doesNotMatch(html, sameSiteLink, `${name}: link leaving A for another variant or a local server`);
      assert.doesNotMatch(html, placeholderLink, `${name}: link to a placeholder domain`);
      if (name !== 'index.html') assert.match(html, /\[data-skin=pixel\] \.interior-page \.content-page \{/, `${name}: retro TV-screen styles missing`);
      // Light water motion (owner's choice, 25 Oct.): A's pixel rings on its home only, never B's soft rings, and they stop for reduced motion.
      if (name === 'index.html') { assert.match(html, /@keyframes ring-a/, 'A home: pixel water rings missing'); assert.match(html, /\.home-page \.lily-screen::after \{ animation:none/, 'A home: water rings must stop for reduced motion'); }
      assert.doesNotMatch(html, /@keyframes ring-b/, `${name}: B water rings in A`);
    }
    assert.deepEqual(brokenPages(pages), [], 'links to internal pages that do not exist');
  } finally { await rm(out, { recursive: true, force: true }); }
});

test('B (modern) never loads the retro A styles or links to A', { timeout: 120000 }, async () => {
  const { out, pages } = await build('b');
  try {
    for (const { name, html } of pages) {
      assert.match(html, /--b-surface:var\(--deep-sea\)/, `${name}: approved B background missing`);
      assert.match(html, /data-skin="modern"/, `${name}: B must use the modern skin`);
      assert.doesNotMatch(html, /\[data-skin=pixel\] \.interior-page \.content-page \{/, `${name}: retro A styles in B`);
      assert.doesNotMatch(html, /\.pixel-water \{/, `${name}: retro A home styles in B`);
      if (name === 'index.html') { assert.match(html, /@keyframes ring-b/, 'B home: water rings missing'); assert.match(html, /\.pad::after \{ animation:none/, 'B home: water rings must stop for reduced motion'); }
      assert.doesNotMatch(html, /@keyframes ring-a/, `${name}: A pixel water rings in B`);
      assert.doesNotMatch(html, sameSiteLink, `${name}: link leaving B for another variant or a local server`);
      assert.doesNotMatch(html, placeholderLink, `${name}: link to a placeholder domain`);
    }
    assert.deepEqual(brokenPages(pages), [], 'links to internal pages that do not exist');
  } finally { await rm(out, { recursive: true, force: true }); }
});
