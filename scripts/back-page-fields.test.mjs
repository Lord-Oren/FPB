import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {prepareSiteContent} from '../src/data/site-content.js';import {migrate,snapshots} from '../editor/backend/model.mjs';
const site=JSON.parse(fs.readFileSync(new URL('../src/data/site-content.json',import.meta.url)));const cases=JSON.parse(fs.readFileSync(new URL('../src/data/case-studies-public.json',import.meta.url)));
test('About and Contact fields default without replacing existing client text and publish safely',()=>{
 const input=structuredClone(site);input.about.manifesto='Our own words';input.contact.title='Talk to our studio';
 const state=migrate(input,cases,undefined,'2026-11-16');assert.equal(state.pages.about.fields.storyTitle,'Our Story');assert.equal(state.pages.about.fields.manifesto,'Our own words');
 const out=prepareSiteContent(snapshots(state).site);assert.equal(out.contact.title,'Talk to our studio');assert.equal(out.about.manifesto,'Our own words');
 input.about.extendedTeam=[{name:'Person',role:'Designer',photo:null}];assert.equal(prepareSiteContent(input).about.extendedTeam.length,1);
 input.about.manifestoTitle='x'.repeat(121);assert.throws(()=>prepareSiteContent(input),/120/);
});

test('pre-V1 saved page drafts receive new fields without losing edits',async()=>{
 const {upgradeContent}=await import('../editor/backend/content-upgrade.mjs');const state=migrate(site,cases,undefined,'2026-11-16');
 for(const version of ['fields','live']){delete state.pages.about[version].storyTitle;delete state.pages.contact[version].title;}
 state.pages.about.fields.story='Saved client draft';const result=upgradeContent(state);
 assert.equal(result.state.pages.about.fields.storyTitle,'Our Story');assert.equal(result.state.pages.about.fields.story,'Saved client draft');assert.notEqual(result.state.pages.about.live.story,'Saved client draft');assert.equal(result.state.pages.contact.live.title,'Write to us');
});
