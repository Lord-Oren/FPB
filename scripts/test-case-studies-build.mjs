// Real Astro builds in a disposable workspace. No fixture is written into src/.
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { checkExport } from './check-export.mjs';
import { migrateCatalog, changeCatalog, selectedSnapshot } from '../editor/catalog.mjs';
import {prepareStructure,structurePages} from '../src/data/structure.js';
const siteData=JSON.parse(await readFile(new URL('../src/data/site-content.json',import.meta.url),'utf8'));
const pages=structurePages(prepareStructure(siteData.structure,siteData.home));
import { snapshotFixture } from './fixtures/case-studies.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const cache = path.join(tmpdir(), 'fpb-build-tests');
await mkdir(cache, { recursive: true });
const temporary = await mkdtemp(path.join(cache, 'case-study-build-'));
const source = path.join(temporary, 'astro');
const snapshotPath = path.join(source, 'src/data/case-studies-public.json');
const output = path.join(source, 'exports');
const original = await readFile(path.join(project, 'src/data/case-studies-public.json'));
const digest = value => createHash('sha256').update(value).digest('hex');
async function outputHash() {
  const files = (await readdir(output)).sort();
  return digest(Buffer.concat(await Promise.all(files.map(name => readFile(path.join(output, name))))));
}
function build(success = true) {
  const result = spawnSync('npm', ['run', 'export:client'], { cwd: source, encoding: 'utf8', env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' } });
  assert(!result.error, result.error?.message);
  assert.equal(result.status === 0, success, result.stdout + result.stderr);
}
try {
  await cp(project, source, { recursive: true, filter: file => !['.git', 'exports', 'node_modules', 'dist', '.astro', '.cache', '.local-editor'].includes(path.basename(file)) && !path.basename(file).startsWith('._') });
  await symlink(path.join(project, 'node_modules'), path.join(source, 'node_modules'), 'dir');
  let snapshot = snapshotFixture();
  const attack = '<img src=x onerror=alert(1)>';
  snapshot.cases[0].content.title = attack;
  snapshot.cases[0].content.cover.alt = '" onload="alert(1)';
  snapshot.cases[0].content.cover.caption = attack;
  snapshot.cases[0].content.results = attack;
  snapshot.cases[0].content.gallery = [{assetId:'test-pixel',alt:'Gallery one',caption:'GALLERY_FIRST',credit:'Synthetic studio'},{assetId:'test-pixel',alt:'Gallery two',caption:'GALLERY_SECOND',credit:'Synthetic studio'}];
  const second = structuredClone(snapshot.cases[0]); second.id = second.slug = 'second'; second.content.title = 'Second synthetic fixture';
  snapshot.cases.unshift(second);
  let catalog=migrateCatalog(undefined,snapshot);
  catalog=changeCatalog(catalog,'save',{id:'synthetic-one',draftRevision:1,content:{title:'UNSELECTED_DRAFT_SENTINEL',gallery:[]}});
  snapshot=selectedSnapshot(catalog);
  await writeFile(snapshotPath, JSON.stringify(snapshot));
  build();
  assert.equal((await checkExport(output)).pages, pages.length + 3);
  const listing = await readFile(path.join(output, 'case-studies.html'), 'utf8');
  const detail = await readFile(path.join(output, 'case-study-synthetic-one.html'), 'utf8');
  assert(listing.indexOf('case-study-second.html') < listing.indexOf('case-study-synthetic-one.html'));
  assert(!detail.includes(attack));
  assert(!detail.includes('UNSELECTED_DRAFT_SENTINEL'));
  assert(detail.indexOf('GALLERY_FIRST') < detail.indexOf('GALLERY_SECOND'));
  assert(detail.includes('Synthetic studio'));
  assert(detail.includes('&lt;img'));
  assert(!/<img[^>]*\sonload="alert/.test(detail));
  assert(detail.includes('data:image/png;base64,'));
  assert(detail.includes('href="case-studies.html"'));
  const beforeFailure = await outputHash();
  snapshot.cases[0].status = 'draft';
  await writeFile(snapshotPath, JSON.stringify(snapshot));
  build(false);
  assert.equal(await outputHash(), beforeFailure, 'Failed build must preserve previous client export');
  catalog=changeCatalog(catalog,'withdraw',{revision:catalog.revision,id:'second'});
  snapshot=selectedSnapshot(catalog);
  await writeFile(snapshotPath, JSON.stringify(snapshot));
  build();
  assert.equal((await checkExport(output)).pages, pages.length + 2);
  assert(!(await readdir(output)).includes('case-study-second.html'), 'Removed page must not survive a new build');
  catalog=changeCatalog(catalog,'withdraw',{revision:catalog.revision,id:'synthetic-one'});
  catalog=changeCatalog(catalog,'restore',{revision:catalog.revision,id:'synthetic-one'});
  assert.equal(catalog.records.find(r=>r.id==='synthetic-one').withdrawn,false);
  await writeFile(snapshotPath, JSON.stringify(selectedSnapshot(catalog)));
  build();
  assert.equal((await checkExport(output)).pages, pages.length + 1);
  assert((await readFile(path.join(output, 'case-studies.html'), 'utf8')).includes('New work is on its way.'));
  console.log('PASS: 4 real builds; route counts derived from current pages; escaped text/attributes; embedded media; stable relative links; draft rejected; failed build preserves export; obsolete pages removed; gallery order/credits; unselected draft excluded; restored case not republished.');
} finally {
  await rm(temporary, { recursive: true, force: true });
  assert.equal(digest(await readFile(path.join(project, 'src/data/case-studies-public.json'))), digest(original), 'Active snapshot must remain unchanged');
}
