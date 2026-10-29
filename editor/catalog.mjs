import assert from 'node:assert/strict';
import { preparePublicCases } from '../src/data/case-studies.js';

import { contentLimits as limits, contentDiagnostics, diagnosticMessage } from './diagnostics.js';
export { limits };
function validateFields(content, media, caseId, complete) {
 const issues=contentDiagnostics(content,caseId,{complete,media});
 if(issues.length){const error=new Error(`${caseId}.${issues[0].index?issues[0].field.replace('gallery',`gallery[${issues[0].index}]`):issues[0].field} : ${diagnosticMessage(issues[0])}.`);error.diagnostics=issues;throw error;}
}
const clone = value => structuredClone(value);
const check = (condition, message) => assert(condition, message);
function plain(value, keys, field) {
  check(value && Object.getPrototypeOf(value) === Object.prototype, `${field}: expected an object.`);
  check(Object.keys(value).every(key => keys.includes(key)), `${field}: unknown field.`);
}
export function identifier(value) { check(typeof value === 'string' && value.length <= 100 && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value), 'Invalid page address.'); return value; }
function text(value, key, field) {
  check(typeof value === 'string' && value.length <= limits[key] && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value), `${field}: invalid text (up to ${limits[key]} characters).`);
  return value.trim();
}
export function draftContent(value, media, key) {
  plain(value, ['title','summary','context','work','client','results','cover','gallery'], key);
  validateFields(value,media,key,false);
  const result = {};
  for (const field of ['title','summary','context','work','client','results']) result[field] = text(value[field] ?? '', field, `${key}.${field}`);
  const image = (image, field) => {
    plain(image,['assetId','alt','caption','credit'],field);
    identifier(image.assetId); check(media.some(asset => asset.id === image.assetId), `${field}.assetId: image missing.`);
    return {assetId:image.assetId,...Object.fromEntries(['alt','caption','credit'].map(k=>[k,text(image[k] ?? '',k,`${field}.${k}`)]))};
  };
  if (Object.hasOwn(value, 'cover')) result.cover = image(value.cover, `${key}.cover`);
  check(Array.isArray(value.gallery) && value.gallery.length <= 12, `${key}.gallery : maximum 12 images.`);
  result.gallery = value.gallery.map((v,i)=>image(v,`${key}.gallery[${i+1}]`));
  return result;
}
export function assetsFor(cases, media) {
  const used = new Set(cases.flatMap(item => [item.content.cover,...(item.content.gallery || [])]).filter(Boolean).map(image => image.assetId));
  return media.filter(asset => used.has(asset.id));
}
export function selectedSnapshot(state) {
  const cases=state.records.filter(r=>!r.withdrawn && r.selected).map(r=>({id:r.id,slug:r.slug,status:'published',content:clone(r.selected.content)}));
  return {schemaVersion:1,cases,media:clone(assetsFor(cases,state.media))};
}
function publishable(record, media) {
  const content=record.draft.content;
  validateFields(content,media,record.id,true);
  const item={id:record.id,slug:record.slug,status:'published',content};
  preparePublicCases({schemaVersion:1,cases:[item],media:assetsFor([item],media)});
}
export function migrateCatalog(legacy, published) {
  if(legacy?.schemaVersion === 2) { validateCatalog(legacy); return legacy; }
  if (legacy) plain(legacy, ['revision','snapshot'], 'old catalog');
  const source=legacy?.snapshot ?? published;
  check(source?.schemaVersion===1 && Array.isArray(source.cases) && Array.isArray(source.media),'The old catalog is invalid. Import stopped.');
  const media=clone(published.media);
  for(const asset of source.media) { const existing=media.find(a=>a.id===asset.id); check(!existing || JSON.stringify(existing)===JSON.stringify(asset),`Media file ${asset.id} differs. Import stopped.`); if(!existing)media.push(clone(asset)); }
  const records=source.cases.map(item=>{
    const live=published.cases.find(p=>p.id===item.id);
    check(!live || live.slug===item.slug,`Page address ${item.id} differs. Import stopped.`);
    const content=draftContent(item.content,media,item.id);
    return {id:item.id,slug:item.slug,draft:{revision:1,content},selected:live ? {revision:0,content:clone(live.content)}:null,withdrawn:false};
  });
  for(const live of published.cases) if(!records.some(r=>r.id===live.id))records.push({id:live.id,slug:live.slug,draft:{revision:1,content:clone(live.content)},selected:null,withdrawn:true});
  const result={schemaVersion:2,revision:legacy?.revision ?? 0,records,media};validateCatalog(result);return result;
}
export function validateCatalog(state) {
  plain(state,['schemaVersion','revision','records','media'],'catalog');
  check(state.schemaVersion===2 && Number.isSafeInteger(state.revision) && state.revision>=0,'Invalid catalog version.');
  check(Array.isArray(state.records)&&state.records.length<=100 && Array.isArray(state.media)&&state.media.length<=200,'The catalog exceeds the item or media limit.');
  preparePublicCases({schemaVersion:1,cases:[],media:state.media});
  const ids=new Set(),slugs=new Set();
  for(const r of state.records){
    plain(r,['id','slug','draft','selected','withdrawn','lastSelection','recoveryDraft'],'item');identifier(r.id);identifier(r.slug);
    check(!ids.has(r.id)&&!slugs.has(r.slug),'This ID or page address is already reserved.');ids.add(r.id);slugs.add(r.slug);
    check(typeof r.withdrawn==='boolean' && !(r.withdrawn && r.selected),'Invalid withdrawn status.');
    plain(r.draft,['revision','content'],r.id+'.draft');check(Number.isSafeInteger(r.draft.revision)&&r.draft.revision>=1,'Invalid item revision.');draftContent(r.draft.content,state.media,r.id);
    for(const saved of [r.lastSelection,r.recoveryDraft].filter(Boolean)){plain(saved,['revision','content'],r.id+'.history');check(Number.isSafeInteger(saved.revision)&&saved.revision>=0,'Invalid saved revision.');draftContent(saved.content,state.media,r.id);}
    if(r.selected){plain(r.selected,['revision','content'],r.id+'.selected');check(Number.isSafeInteger(r.selected.revision)&&r.selected.revision>=0&&r.selected.revision<=r.draft.revision,'Invalid selected revision.');publishable({...r,draft:r.selected},state.media);}
  }
  check(Buffer.byteLength(JSON.stringify(state))<=64*1024*1024,'The local catalog is larger than 64 MiB.');
}
function creationTitle(value) {
  const issues=contentDiagnostics({title:value,gallery:[]},'',{complete:false}).filter(issue=>issue.field==='title');
  if(typeof value!=='string')issues.push({field:'title',code:'invalid_type'});
  else if(!value.trim())issues.push({field:'title',code:'required'});
  if(issues.length){const error=new Error('Check the title of the new case study.');error.diagnostics=issues.map(issue=>({...issue,field:'newTitle',caseId:''}));throw error;}
  return value.trim();
}
function uniqueAddress(title, records) {
  let base=title.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/œ/g,'oe').replace(/æ/g,'ae').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  if(!base)base='etude';
  if(!/^[a-z]/.test(base))base='etude-'+base;
  base=base.slice(0,90).replace(/-+$/,'');
  const used=new Set(records.flatMap(record=>[record.id,record.slug]));
  let slug=base;
  for(let suffix=2;used.has(slug);suffix++)slug=base+'-'+suffix;
  return identifier(slug);
}
function conflict(message) { const error=new Error(message);error.status=409;throw error; }
export function changeCatalog(state, action, body) {
  const next=clone(state);
  const record=next.records.find(r=>r.id===body.id);
  if(action==='save') {
    check(record,'Item not found.');
    if(body.draftRevision!==record.draft.revision)conflict('This item changed elsewhere. Your text is still here. Copy your changes before reloading.');
    check(!record.withdrawn,'Restore this item before editing it.');
    check(Array.isArray(body.media ?? []),'Invalid media files.');
    for(const asset of body.media ?? []){const old=next.media.find(a=>a.id===asset.id);check(!old || JSON.stringify(old)===JSON.stringify(asset),'An existing media file cannot be replaced using the same ID.');if(!old)next.media.push(clone(asset));}
    record.draft={revision:record.draft.revision+1,content:draftContent(body.content,next.media,record.id)};
  } else {
    if(action!=='create' && body.revision!==state.revision)conflict('The catalog changed in another window. Reload before continuing. Your changes have not been replaced.');
    if(action==='create'){
      const title=creationTitle(body.title);
      const slug=uniqueAddress(title,next.records);
      next.records.push({id:slug,slug,draft:{revision:1,content:{title,summary:'',context:'',work:'',gallery:[]}},selected:null,withdrawn:false});
    } else if(action==='reorder'){
      check(Array.isArray(body.ids)&&body.ids.length===next.records.length&&new Set(body.ids).size===body.ids.length&&body.ids.every(id=>next.records.some(r=>r.id===id)),'Invalid item order.');
      next.records=body.ids.map(id=>next.records.find(r=>r.id===id));
    } else {
      check(record,'Item not found.');
      if(action==='select') {check(!record.withdrawn,'Restore this item before selecting it.');if(body.draftRevision!==record.draft.revision)conflict('The item revision changed.');publishable(record,next.media);record.selected=clone(record.draft);record.lastSelection=clone(record.selected);}
      else if(action==='deselect') record.selected=null;
      else if(action==='withdraw') {check(!record.withdrawn,'This item is already withdrawn.');record.withdrawn=true;if(record.selected)record.lastSelection=clone(record.selected);record.selected=null;record.draft.revision++;}
      else if(action==='restore') {check(record.withdrawn,'This item is not withdrawn.');record.withdrawn=false;record.selected=null;if(record.lastSelection){record.recoveryDraft=clone(record.draft);record.draft={revision:record.draft.revision+1,content:clone(record.lastSelection.content)};}else record.draft.revision++;}
      else if(action==='recover'){check(!record.withdrawn && record.recoveryDraft,'There is no earlier draft to recover.');const previous=clone(record.draft);record.draft={revision:record.draft.revision+1,content:clone(record.recoveryDraft.content)};record.recoveryDraft=previous;}
      else throw new Error('Unknown action.');
    }
  }
  next.revision++;
  // Keep media reachable from drafts (including withdrawn cases) AND selected revisions.
  next.media=assetsFor(next.records.flatMap(r=>[{content:r.draft.content},...(r.selected?[{content:r.selected.content}]:[]),...(r.lastSelection?[{content:r.lastSelection.content}]:[]),...(r.recoveryDraft?[{content:r.recoveryDraft.content}]:[])]),next.media);
  validateCatalog(next);return next;
}
