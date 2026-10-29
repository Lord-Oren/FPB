import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareSiteContent} from '../src/data/site-content.js';
import {homeLabelDefaults} from '../src/data/editorial.js';
import {homeFields,setPage,migrate,snapshots} from '../editor/backend/model.mjs';
const seed=JSON.parse(await readFile(new URL('../src/data/site-content.json',import.meta.url),'utf8'));
const cases={schemaVersion:1,cases:[],media:[]};
test('existing sites receive heading defaults without overwriting saved labels or publishing drafts',()=>{
 const state=migrate(seed,cases,undefined,'2026-10-29');
 for(const [key,value] of Object.entries(homeLabelDefaults))assert.equal(prepareSiteContent(seed).home.editorial[key],value);
 state.pages.home.fields.editorial_homeLatestTitle='Private draft heading';
 assert.equal(prepareSiteContent(snapshots(state).site).home.editorial.homeLatestTitle,'Fresh from the pond.');
 state.pages.home.live=structuredClone(state.pages.home.fields);
 const published=snapshots(state).site;
 assert.equal(prepareSiteContent(published).home.editorial.homeLatestTitle,'Private draft heading');
 assert.equal(homeFields(published.home).editorial_homeLatestTitle,'Private draft heading');
});
test('home headings enforce length and required text while retaining optional labels',()=>{
 const site=structuredClone(seed);const fields=homeFields(site.home);
 fields.editorial_homeNewsTitle=' ';setPage(site,'home',fields);assert.throws(()=>prepareSiteContent(site),/homeNewsTitle/);
 fields.editorial_homeNewsTitle='a'.repeat(121);setPage(site,'home',fields);assert.throws(()=>prepareSiteContent(site),/homeNewsTitle/);
 fields.editorial_homeNewsTitle='Studio news';fields.editorial_homeNewsKicker='';setPage(site,'home',fields);
 assert.equal(prepareSiteContent(site).home.editorial.homeNewsTitle,'Studio news');
 assert.equal(prepareSiteContent(site).home.editorial.homeNewsKicker,'');
});
