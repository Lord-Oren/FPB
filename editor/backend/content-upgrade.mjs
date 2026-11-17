// Idempotent upgrade: remove pristine shipped content; never repopulate examples.
import {validateWording} from '../../src/data/wording.js';
import {createHash} from 'node:crypto';
import {prepareStructure} from '../../src/data/structure.js';
import {homeFields,snapshots,setPage} from './model.mjs';
import {hydrateSnapshot} from './history.mjs';
import {cleanSite,pristineRecord,unchangedPictures,unmark} from './no-demo.mjs';
export function cleanPlaceholderLinks(value){
 const copy=structuredClone(value);
 const walk=x=>{if(!x||typeof x!=='object')return;for(const [k,v]of Object.entries(x))if(typeof v==='string'&&['url','link','gramUrl','video','audio'].includes(k)){try{if(/(^|\.)example\.(com|org|net)$/i.test(new URL(v).hostname))x[k]='';}catch{}}else walk(v);if(Array.isArray(x.socials))x.socials=x.socials.filter(s=>s.url);};walk(copy);return copy;
}
export function cleanPublicSnapshot(snapshot,report=[]){const copy=cleanPlaceholderLinks(snapshot);copy.site=cleanSite(copy.site,report);return copy;}
function upgradeLegacyContent(state){
 const marker='v1-content-20261116';if(state.migrations?.includes(marker))return null;
 let next=structuredClone(state);const report=[];next.pages.legal??={revision:1,fields:{intro:'',documentId:null},live:{intro:'',documentId:null}};
 next.items=next.items.filter(item=>{
  if(!item.demo)return true;
  if(pristineRecord(item.publicId,item.fields)&&unchangedPictures(item.fields,next.media)&&(!item.live||(pristineRecord(item.publicId,item.live)&&unchangedPictures(item.live,next.media))))return false;
  report.push({kind:'item',id:item.id,action:'kept-edited'});return true;
 });
 // Clean page versions separately so drafts are never inadvertently published.
 for(const version of ['fields','live']){
  const site=structuredClone(next.base);site.works=[];site.events=[];site.press=[];site.media=structuredClone(next.media);
  for(const [name,page]of Object.entries(next.pages))setPage(site,name,page[version]);
  const clean=cleanSite(cleanPlaceholderLinks(site),report);
  for(const [name,page]of Object.entries(next.pages))page[version]=name==='home'?homeFields(clean.home):structuredClone(clean[name]??{});
 }
 const retired=next.items.filter(i=>i.section==='presentations');
 if(retired.length)next.retiredSections=[...(next.retiredSections??[]),{section:'presentations',items:retired}];
 next.items=next.items.filter(i=>i.section!=='presentations');
 next.base=cleanSite(cleanPlaceholderLinks(next.base),report);
 // Preserve edited material from the retired section even if it exists only
 // in an older publication. It stays private and is never restored publicly.
 const archived=new Set();
 const archiveRetired=snapshot=>{
  const records=snapshot.site.works.filter(r=>r.rubric==='presentations'&&(!r.demo||!pristineRecord(r.id,Object.fromEntries(Object.entries(r).filter(([k])=>!['id','rubric','demo'].includes(k))))||!unchangedPictures(r,snapshot.site.media)));
  if(!records.length)return;
  const ids=new Set();const scan=x=>{if(!x||typeof x!=='object')return;if(x.mediaId)ids.add(x.mediaId);Object.values(x).forEach(scan);};scan(records);
  const entry={section:'presentations',publishedItems:records,media:snapshot.site.media.filter(m=>ids.has(m.id))};const digest=createHash('sha256').update(JSON.stringify(entry)).digest('hex');
  if(!archived.has(digest)){(next.retiredSections??=[]).push(entry);archived.add(digest);report.push(...records.map(r=>({kind:'retired-publication',id:r.id,action:'kept-private'})));}
 };
 if(next.initialPublic){const old=hydrateSnapshot(next,next.initialPublic);archiveRetired(old);next.initialPublic=cleanPublicSnapshot(old,report);}
 for(const publication of next.publishes){const old=hydrateSnapshot(next,publication.snapshot);archiveRetired(old);publication.snapshot=cleanPublicSnapshot(old,report);}
 delete next.publicationBlobs;
 // Keep media used by edited items, even if it originally came from the seed.
 const used=new Set();const scan=x=>{if(!x||typeof x!=='object')return;if(x.mediaId)used.add(x.mediaId);Object.values(x).forEach(scan);};scan(next.items);scan(next.pages);scan(next.retiredSections);
 next.media=next.media.filter(m=>!m.demo||used.has(m.id)||used.has(m.id.replace(/^demo-/,'retained-')));
 const remap=new Map(next.media.filter(m=>m.id.startsWith('demo-')).map(m=>[m.id,'retained-'+m.id.slice(5)]));
 const walk=x=>{if(!x||typeof x!=='object')return;delete x.demo;for(const [k,v]of Object.entries(x)){if(['id','mediaId','publicId'].includes(k)&&typeof v==='string'&&v.startsWith('demo-'))x[k]=remap.get(v)??'retained-'+v.slice(5);else walk(v);}};
 walk(next.items);walk(next.pages);walk(next.media);walk(next.retiredSections);
 next.structure??={revision:1,fields:prepareStructure(undefined,next.base.home),live:prepareStructure(undefined,next.base.home)};
 for(const version of ['fields','live']){
  next.structure[version].nodes=next.structure[version].nodes.filter(n=>n.id!=='presentations');
  for(const node of next.structure[version].nodes){const label={recents:['Recents','Recent.'],gram:['Gram','Ribbit.'],croak:['Croak','Croak.']}[node.id];if(label&&node.title===label[0])node.title=label[1];}
  const nodes=next.structure[version].nodes;const screens=nodes.filter(n=>n.zone==='screens'&&n.parentId===null);const order=['announcements','recents','gram','croak'];screens.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));let i=0;next.structure[version].nodes=nodes.map(n=>screens.includes(n)?screens[i++]:n);
 }
 next=unmark(next);next.migrations=[...(next.migrations??[]),marker];next.contentMigrationReport=report;
 return {state:next,snapshot:snapshots(next),changed:true};
}

// One-time owner-approved contact fallback. Later intentional edits stay untouched.
function upgradeContact(state){
 const upgrade=upgradeLegacyContent(state),marker='contact-address-20261116';
 if((upgrade?.state??state).migrations?.includes(marker))return upgrade;
 const next=upgrade?.state??structuredClone(state);let changed=false;
 for(const contact of [next.base?.contact,next.pages.contact?.fields,next.pages.contact?.live])if(contact&&!contact.email?.trim()){contact.email='frogpondboys@gmail.com';changed=true;}
 next.migrations=[...(next.migrations??[]),marker];
 return {state:next,snapshot:snapshots(next),changed:!!upgrade?.changed||changed};
}

// Add the editor page without publishing a draft or rewriting publication history.
function upgradeWording(state) {
 const upgrade=upgradeContact(state), current=upgrade?.state??state;
 if(current.pages.wording)return upgrade;
 const next=upgrade?.state??structuredClone(state), fields=validateWording(next.base.wording);
 next.pages.wording={revision:1,fields,live:structuredClone(fields)};
 return {state:next,snapshot:snapshots(next),changed:!!upgrade?.changed};
}

// Client feedback, November 17. Change only the former default title and the
// two canonical navigation entries. Draft/live versions are migrated separately.
// Publication history remains immutable; the retired wording key stays readable.
export function upgradeContent(state) {
 const upgrade=upgradeWording(state),current=upgrade?.state??state,marker='client-feedback-20261117';
 if(current.migrations?.includes(marker))return upgrade;
 const next=structuredClone(current),before=snapshots(current);
 const cleanAbout=about=>{if(about?.teamTitle==='Our Team')about.teamTitle='The Frogs';};
 const cleanTree=tree=>{for(const n of tree?.nodes??[])if((n.id==='footer-legal'&&n.href==='legal.html')||(n.id==='magazine'&&n.slug==='magazine'&&n.kind==='works'))n.visible=false;};
 cleanAbout(next.base.about);if(next.base.wording)next.base.wording=validateWording(next.base.wording);cleanTree(next.base.structure);
 for(const [id,page]of Object.entries(next.pages)){
  const original=JSON.stringify(page.fields);
  for(const version of ['fields','live']){
   if(id==='about')cleanAbout(page[version]);
   if(id==='wording')page[version]=validateWording(page[version]);
  }
  if(JSON.stringify(page.fields)!==original)page.revision++;
 }
 const treeBefore=JSON.stringify(next.structure.fields);
 for(const version of ['fields','live'])cleanTree(next.structure[version]);
 if(JSON.stringify(next.structure.fields)!==treeBefore)next.structure.revision++;
 next.migrations=[...(next.migrations??[]),marker];
 const snapshot=snapshots(next);
 return {state:next,snapshot,changed:!!upgrade?.changed||JSON.stringify(before)!==JSON.stringify(snapshot)};
}
