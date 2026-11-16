import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {migrate,snapshots} from '../editor/backend/model.mjs';import {upgradeContent} from '../editor/backend/content-upgrade.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
test('published snapshots no longer expose a sample badge; legacy flags are removed by migration',()=>{
 const state=migrate(read('../src/data/site-content.json'),read('../src/data/case-studies-public.json'),undefined,'2026-11-16');
 assert.equal(Object.hasOwn(snapshots(state).site,'demo'),false);
 state.base.demo=true;assert.equal(Object.hasOwn(snapshots(state).site,'demo'),false);
 const upgraded=upgradeContent(state);assert.equal(Object.hasOwn(upgraded.snapshot.site,'demo'),false);
});
