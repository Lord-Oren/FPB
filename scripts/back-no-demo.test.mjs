import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {defaultStructure} from '../src/data/structure.js';
import {migrate} from '../editor/backend/model.mjs';import {upgradeContent,cleanPublicSnapshot} from '../editor/backend/content-upgrade.mjs';import {editorialDefaults} from '../src/data/editorial.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
const cases={schemaVersion:1,cases:[],media:[]};const seed=read('../src/data/site-content.json');const legacy=read('./fixtures/legacy-site-content.json');
const clean=value=>assert.doesNotMatch(JSON.stringify(value),/"demo"|example\.com|\bdemo\b|\bsample\b|\blorem\b|\bfictional\b|made-up/i);
test('production seed, defaults, legacy upgrade and restore contain no examples',()=>{
 clean(seed);clean(editorialDefaults);const state=migrate(legacy,cases,undefined,'2026-11-16');state.initialPublic={site:legacy,cases};
 const result=upgradeContent(state);clean(result.snapshot);assert.equal(result.state.items.length,0);assert.equal(upgradeContent(result.state),null);clean(cleanPublicSnapshot(state.initialPublic));
});
test('edited legacy content is preserved and reported, without publishing its draft',()=>{
 const state=migrate(legacy,cases,undefined,'2026-11-16');const item=state.items[0];item.fields.title='Client-owned draft';
 const result=upgradeContent(state);const kept=result.state.items.find(i=>i.id===item.id);assert(kept);assert.equal(kept.fields.title,'Client-owned draft');assert.equal(kept.live.title,item.live.title);assert(!('demo'in kept));assert(result.state.contentMigrationReport.some(r=>r.id===item.id));
});
test('replaced About images and private retired content keep their bytes and references',()=>{
 const state=migrate(legacy,cases,undefined,'2026-11-16');const photo=state.pages.about.fields.photos[0];const media=state.media.find(m=>m.id===photo.mediaId);media.base64=state.media.find(m=>m.mime===media.mime&&m.base64!==media.base64).base64;
 const retired=state.items.find(i=>i.section==='presentations');retired.fields.title='Client presentation';const picture=retired.fields.image;const original=state.media.find(m=>m.id===picture.mediaId).base64;
 const result=upgradeContent(state);const kept=result.state.pages.about.fields.photos[0];assert(kept);assert.equal(result.state.media.find(m=>m.id===kept.mediaId).base64,media.base64);
 const saved=result.state.retiredSections[0].items.find(i=>i.id===retired.id);assert.equal(saved.fields.title,'Client presentation');assert.equal(result.state.media.find(m=>m.id===saved.fields.image.mediaId).base64,original);assert(!result.snapshot.site.works.some(w=>w.rubric==='presentations'));
});
test('home defaults change only when unedited and explicit collection order survives',()=>{
 assert.deepEqual(defaultStructure().nodes.filter(n=>n.zone==='screens').map(n=>n.title),['Announcements','Recent.','Ribbit.','Croak.']);assert.equal(defaultStructure({navigation:{gram:'Backstage'}}).nodes.find(n=>n.id==='gram').title,'Backstage');
 const state=migrate(legacy,cases,undefined,'2026-11-16');state.pages.home.fields.editorial_homeLatestKicker='Our own label';state.pages.home.live.editorial_homeLatestKicker='Latest work';state.pages.home.live.editorial_homeCroakLink='Listen now';
 const result=upgradeContent(state);assert.equal(result.state.pages.home.fields.editorial_homeLatestKicker,'Our own label');assert.equal(result.state.pages.home.live.editorial_homeLatestKicker,'');assert.equal(result.state.pages.home.live.editorial_homeCroakLink,'Tune in');
});

test('edited Presentations present only in an old publication are archived privately',()=>{
 const state=migrate(seed,cases,undefined,'2026-11-16');const old=structuredClone(legacy);const record=old.works.find(w=>w.rubric==='presentations');record.title='Archived client presentation';state.publishes=[{id:'old',snapshot:{site:old,cases}}];
 const result=upgradeContent(state);assert(result.state.retiredSections.some(x=>x.publishedItems?.some(r=>r.title===record.title)));assert(!result.state.publishes[0].snapshot.site.works.some(w=>w.rubric==='presentations'));assert(!result.snapshot.site.works.some(w=>w.rubric==='presentations'));
});
