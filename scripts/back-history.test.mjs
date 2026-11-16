import test from 'node:test';
import assert from 'node:assert/strict';
import {compactHistory,hydrateSnapshot,HISTORY_LIMIT} from '../editor/backend/history.mjs';
test('50 publications share photo bytes, bound history, and restore exact versions',()=>{
 const photo=Buffer.alloc(512*1024,71).toString('base64');
 const snapshot=n=>({site:{title:'Publication '+n,media:[{id:'photo',mime:'image/png',base64:photo}]},cases:{media:[]}});
 const state={publishes:[],initialPublic:snapshot(0),failures:[]};
 for(let n=1;n<=50;n++){state.publishes.unshift({id:String(n),snapshot:snapshot(n)});compactHistory(state);}
 assert.equal(state.publishes.length,HISTORY_LIMIT);assert.equal(Object.keys(state.publicationBlobs).length,1);
 assert(Buffer.byteLength(JSON.stringify(state))<4*1024*1024);
 assert.deepEqual(hydrateSnapshot(state,state.publishes[9].snapshot),snapshot(41));
 assert.deepEqual(hydrateSnapshot(state,state.initialPublic),snapshot(0));
 const before=structuredClone(state);compactHistory(state);assert.deepEqual(state,before);
});
test('same media ID with changed bytes keeps both historical versions; missing blobs fail closed',()=>{
 const state={publishes:[{snapshot:{site:{media:[{id:'x',base64:'old'}]},cases:{media:[]}}}]};compactHistory(state);
 state.publishes.unshift({snapshot:{site:{media:[{id:'x',base64:'new'}]},cases:{media:[]}}});compactHistory(state);
 assert.equal(hydrateSnapshot(state,state.publishes[1].snapshot).site.media[0].base64,'old');
 assert.equal(hydrateSnapshot(state,state.publishes[0].snapshot).site.media[0].base64,'new');
 state.publicationBlobs={};assert.throws(()=>hydrateSnapshot(state,state.publishes[0].snapshot),/missing/);
});

test('restoring changed image bytes keeps the new draft and the old publication separate',async()=>{
 const {preserveRestoredMedia}=await import('../editor/backend/history.mjs');
 const current={media:[{id:'photo',mime:'image/png',base64:'new'}],items:[{fields:{image:{mediaId:'photo'}}}]};
 const restored={media:[{id:'photo',mime:'image/png',base64:'old'}],items:[{live:{image:{mediaId:'photo'}}}],pages:{about:{live:{photos:[{mediaId:'photo'}]}}}};
 preserveRestoredMedia(current,restored);const id=restored.items[0].live.image.mediaId;
 assert.notEqual(id,'photo');assert.equal(restored.pages.about.live.photos[0].mediaId,id);assert.equal(current.media.find(m=>m.id===id).base64,'old');assert.equal(current.items[0].fields.image.mediaId,'photo');assert.equal(current.media.find(m=>m.id==='photo').base64,'new');
});
