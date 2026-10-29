import { cp, readFile, lstat, mkdtemp, rename, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkExport } from './check-export.mjs';
import { checkOriginalArtwork } from './check-original-artwork.mjs';
import {prepareStructure,structurePages} from '../src/data/structure.js';
const siteData=JSON.parse(await readFile(new URL('../src/data/site-content.json',import.meta.url),'utf8'));
const pages=structurePages(prepareStructure(siteData.structure,siteData.home));
import { preparePublicCases } from '../src/data/case-studies.js';
import { artworkMode } from '../src/data/presentation.js';

const project = fileURLToPath(new URL('../', import.meta.url));
const parent = project;
const target = path.join(parent, 'exports');
assert(!existsSync(path.join(parent, 'manifest.json')), 'Frozen version: copy sources into a workspace before exporting.');
if (existsSync(target)) assert((await lstat(target)).isDirectory() && !(await lstat(target)).isSymbolicLink(), 'The destination must be a regular generated directory.');

const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
  cwd: project, stdio: 'inherit', env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
const dist = path.join(project, 'dist');
const cases = preparePublicCases(JSON.parse(await readFile(path.join(project, 'src/data/case-studies-public.json'), 'utf8')));
const expectedRoutes = ['index.html', ...pages.map(page => `${page.slug}.html`), ...cases.map(item => item.href)];
await checkExport(dist, { expectedRoutes });
assert(['original', 'adapted'].includes(artworkMode), 'Unknown artwork mode.');
await checkOriginalArtwork(dist);

// Prepare the full copy before replacing the previous generated export.
const temporary = await mkdtemp(path.join(parent, '.html-export-'));
const next = path.join(temporary, 'next');
const previous = path.join(temporary, 'previous');
let saved = false;
let installed = false;
try {
  await cp(dist, next, { recursive: true, errorOnExist: true, force: false });
  await checkExport(next, { expectedRoutes });
  if (existsSync(target)) { await rename(target, previous); saved = true; }
  await rename(next, target);
  installed = true;
} catch (error) {
  if (saved && !installed) await rename(previous, target);
  throw error;
} finally {
  if (installed || !existsSync(previous)) await rm(temporary, { recursive: true, force: true });
}
console.log(`Client export ready: ${target}. Share only the HTML files in this directory.`);
