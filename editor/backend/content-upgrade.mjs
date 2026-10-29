// Upgrade only demo assets and placeholder links. Preserve user content and immutable publication history.
import {prepareStructure} from '../../src/data/structure.js';
import {homeFields,snapshots,uid} from './model.mjs';
import {isDeepStrictEqual} from 'node:util';
const marker='pixel-demo-20261025';
export function cleanPlaceholderLinks(value){
 const copy=structuredClone(value);
 function walk(x){
  if(!x||typeof x!=='object')return;
  for(const [key,v] of Object.entries(x)){
   if(typeof v==='string'&&['url','link','gramUrl','video','audio'].includes(key)){
    try{const u=new URL(v);if(['http:','https:'].includes(u.protocol)&&/(^|\.)example\.(com|org|net)$/i.test(u.hostname))x[key]='';}catch{}
   }else walk(v);
  }
  if(Array.isArray(x.socials))x.socials=x.socials.filter(s=>s.url);
 }
 walk(copy);return copy;
}
export function addPixelTwins(media,seed){
 let added=0;
 for(const twin of seed.media.filter(m=>m.id.endsWith('-pixel')&&m.demo===true)){
  const id=twin.id.slice(0,-6),original=seed.media.find(m=>m.id===id),existing=media.find(m=>m.id===id);
  // Do not attach an unrelated generated twin to a replaced user picture.
  if(original&&existing&&original.base64===existing.base64&&original.mime===existing.mime&&!media.some(m=>m.id===twin.id)){media.push(structuredClone(twin));added++;}
 }
 return added;
}
function upgradePixelContent(state,seed){
 if(state.migrations?.includes(marker))return null;
 const next=structuredClone(state);
 for(const item of [...next.items,...Object.values(next.pages)]){
  const fields=cleanPlaceholderLinks(item.fields),live=cleanPlaceholderLinks(item.live);
  if(!isDeepStrictEqual(fields,item.fields)||!isDeepStrictEqual(live,item.live))item.revision++;
  item.fields=fields;item.live=live;
 }
 next.base=cleanPlaceholderLinks(next.base);addPixelTwins(next.media,seed);
 const current=state.publishes[0]?.snapshot??state.initialPublic;
 const snapshot=cleanPlaceholderLinks(current);addPixelTwins(snapshot.site.media,seed);
 const changed=!isDeepStrictEqual(snapshot,current)||!isDeepStrictEqual(next,state);
 next.migrations=[...(next.migrations??[]),marker];
 return {state:next,snapshot,changed};
}

// Add meeting features without replacing user edits, private records or prior publications.
function upgradeMeeting(state,seed){
 const pixel=upgradePixelContent(state,seed);
 const current=pixel?.state??state;
 const meeting='client-meeting-20261029';
 if(current.migrations?.includes(meeting))return pixel;
 const next=structuredClone(current);
 const home=next.pages.home;
 const defaults=homeFields(seed.home);
 home.fields={...defaults,...home.fields};home.live={...defaults,...home.live};home.revision++;
 for(const section of ['gram','prc','recognition','statements']){
  if(next.items.some(item=>item.section===section))continue;
  for(const record of seed.works.filter(item=>item.rubric===section&&item.demo)){
   const {id,rubric,demo,...fields}=structuredClone(record);
   // Keep sample images separate if an owner replaced a media ID.
   for(const pic of [fields.image,...(fields.gallery??[])].filter(Boolean)){
    const source=seed.media.find(m=>m.id===pic.mediaId);
    if(!source)continue;
    let target=next.media.find(m=>m.mime===source.mime&&m.base64===source.base64);
    if(!target){target={...structuredClone(source),id:uid('demo')};next.media.push(target);}
    pic.mediaId=target.id;
   }
   const publicId=next.items.some(x=>x.publicId===id)?uid('demo'):id;
   next.items.push({id:uid('work'),publicId,slug:publicId,section,revision:1,fields,live:structuredClone(fields),demo:true});
   next.reserved.push(publicId);
  }
 }
 const sampleJobs=jobs=>Array.isArray(jobs)&&jobs.length===2&&jobs.every(job=>job.demo===true)&&jobs.map(job=>job.title).sort().join('|')==='Junior designer|Video intern';
 for(const version of ['fields','live'])if(sampleJobs(next.pages.join[version]?.positions))next.pages.join[version].positions=structuredClone(seed.join.positions);
 next.migrations=[...(next.migrations??[]),meeting];
 return {state:next,snapshot:snapshots(next),changed:true};
}

export function upgradeContent(state,seed){
 const previous=upgradeMeeting(state,seed);const current=previous?.state??state;if(current.structure)return previous;
 const next=structuredClone(current);const home=structuredClone(next.base.home);
 home.navigation={...home.navigation,...Object.fromEntries(Object.entries(next.pages.home.live).filter(([k])=>k.startsWith('navigation_')).map(([k,v])=>[k.slice(11),v]))};
 const tree=prepareStructure(undefined,home);next.structure={revision:1,fields:tree,live:structuredClone(tree)};next.migrations=[...(next.migrations??[]),'site-zones-20261029'];
 return {state:next,snapshot:snapshots(next),changed:true};
}
