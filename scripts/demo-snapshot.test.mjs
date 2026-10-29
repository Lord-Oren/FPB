import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {migrate,snapshots} from '../editor/backend/model.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
test('sample badge is computed from published content and media, not the previous flag',()=>{
 const state=migrate(read('../src/data/site-content.json'),read('../src/data/case-studies-public.json'),undefined,'2026-10-25');
 assert.equal(snapshots(state).site.demo,true);
 const clear=x=>{if(!x||typeof x!=='object')return;delete x.demo;Object.values(x).forEach(clear);};clear(state);
 state.base.demo=true;assert.equal(snapshots(state).site.demo,false);
 const item=state.items.find(x=>x.section!=='case-studies');item.demo=true;assert.equal(snapshots(state).site.demo,true);
 item.live=null;assert.equal(snapshots(state).site.demo,false);
 state.pages.about.live.team[0].demo=true;assert.equal(snapshots(state).site.demo,true);
});
