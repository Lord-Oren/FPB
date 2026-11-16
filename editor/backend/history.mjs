// Bounded publication history. Media bytes are stored once by content hash;
// references retain the exact media metadata of each historical snapshot.
import {createHash,randomBytes} from 'node:crypto';
export const HISTORY_LIMIT=10;
export function hydrateSnapshot(state,snapshot){
 if(!snapshot)return snapshot;
 const copy=structuredClone(snapshot);
 for(const section of ['site','cases'])copy[section].media=(copy[section].media??[]).map(media=>{
  if(!media.blobRef)return media;
  const {blobRef,...metadata}=media;const base64=state.publicationBlobs?.[blobRef];
  if(typeof base64!=='string')throw new Error('A saved publication is missing a media file.');
  return {...metadata,base64};
 });
 return copy;
}
export function compactHistory(state){
 state.publishes=state.publishes.slice(0,HISTORY_LIMIT);
 const pool=state.publicationBlobs??{};const used=new Set();
 for(const snapshot of [state.initialPublic,...state.publishes.map(p=>p.snapshot)].filter(Boolean)){
  for(const section of ['site','cases'])snapshot[section].media=(snapshot[section].media??[]).map(media=>{
   if(media.blobRef){if(typeof pool[media.blobRef]!=='string')throw new Error('A saved publication is missing a media file.');used.add(media.blobRef);return media;}
   const {base64,...metadata}=media;
   if(typeof base64!=='string')throw new Error('Invalid publication media.');
   const blobRef=createHash('sha256').update(base64).digest('hex');pool[blobRef]=base64;used.add(blobRef);return {...metadata,blobRef};
  });
 }
 state.publicationBlobs=Object.fromEntries([...used].map(key=>[key,pool[key]]));
 if(state.failures)state.failures=state.failures.slice(0,HISTORY_LIMIT);
 return state;
}

// A restored image must not replace bytes still used by a newer draft.
export function preserveRestoredMedia(current,restored){
 const remap=new Map();
 for(const media of restored.media){const old=current.media.find(m=>m.id===media.id);if(old&&(old.mime!==media.mime||old.base64!==media.base64))remap.set(media.id,'m-'+randomBytes(12).toString('hex'));}
 const walk=x=>{if(!x||typeof x!=='object')return;if(remap.has(x.mediaId))x.mediaId=remap.get(x.mediaId);Object.values(x).forEach(walk);};
 walk(restored.items);walk(restored.pages);
 for(const media of restored.media){const copy={...media,id:remap.get(media.id)??media.id};if(!current.media.some(m=>m.id===copy.id))current.media.push(copy);}
}
