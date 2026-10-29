import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {migrate,snapshots,homeFields,setPage} from '../editor/backend/model.mjs';
import {upgradeContent} from '../editor/backend/content-upgrade.mjs';
import {prepareSiteContent} from '../src/data/site-content.js';
const seed=JSON.parse(await readFile(new URL('../src/data/site-content.json',import.meta.url)));
const cases=JSON.parse(await readFile(new URL('../src/data/case-studies-public.json',import.meta.url)));
test('meeting migration preserves custom fields, hidden records, private data and history; runs once',()=>{
 const old=structuredClone(seed);old.works=old.works.filter(x=>!['gram','prc','recognition','statements'].includes(x.rubric));
 const s=migrate(old,cases,undefined,'2026-10-29T00:00:00Z');s.migrations=['pixel-demo-20261025'];s.initialPublic={site:old,cases};s.pages.home.fields.editorial_tagline='Unpublished custom tagline';s.pages.home.live.editorial_tagline='Live custom tagline';s.conversations=[{id:'private',text:'Keep me'}];s.publishes=[{id:'previous',snapshot:structuredClone(s.initialPublic)}];
 const before=structuredClone(s);const u=upgradeContent(s,seed);
 assert.deepEqual(s,before);assert.deepEqual(u.state.conversations,s.conversations);assert.deepEqual(u.state.publishes,s.publishes);
 for(const item of s.items)assert.deepEqual(u.state.items.find(x=>x.id===item.id),item);
 assert.equal(u.state.pages.home.fields.editorial_tagline,'Unpublished custom tagline');assert.equal(u.snapshot.site.home.editorial.tagline,'Live custom tagline');
 assert.equal(u.state.items.filter(x=>x.section==='gram').length,1);assert.equal(upgradeContent(u.state,seed),null);
 prepareSiteContent(snapshots(u.state).site);
});
test('older home snapshots get defaults; owner navigation and text survive publication',()=>{
 const home=homeFields(seed.home);assert.equal(home.navigation_legal,'Legal');home.navigation_gram='Backstage';home.editorial_tagline='Our own words';const site=structuredClone(seed);setPage(site,'home',home);const prepared=prepareSiteContent(site);assert.equal(prepared.home.navigation.gram,'Backstage');assert.equal(prepared.home.editorial.tagline,'Our own words');
 site.home.editorial.croakUrl='javascript:alert(1)';assert.throws(()=>prepareSiteContent(site),/HTTPS/);
 site.home.editorial.croakUrl='';site.home.navigation.unknown='Injected';assert.throws(()=>prepareSiteContent(site),/unexpected field/);
});
