// Validated drafts, legacy migration and public snapshots. Private state never becomes public wholesale.
import {prepareStructure,collectionKinds} from '../../src/data/structure.js';
import {editorialDefaults,navigationDefaults} from '../../src/data/editorial.js';
import {isDeepStrictEqual} from 'node:util';
import {randomBytes} from 'node:crypto';
import {prepareSiteContent,rubrics} from '../../src/data/site-content.js';
import {preparePublicCases} from '../../src/data/case-studies.js';
import {migrateCatalog} from '../catalog.mjs';
export const clone=structuredClone;
export const uid=prefix=>`${prefix}-${randomBytes(12).toString('hex')}`;
export const sections=['case-studies',...Object.values(rubrics).flat()];
export const group=(s,state)=>s==='case-studies'?'case':Object.keys(rubrics).find(k=>rubrics[k].includes(s))??state?.structure?.fields?.nodes.find(n=>n.id===s&&collectionKinds.includes(n.kind))?.kind;
export const sectionIds=state=>[...new Set([...sections,...(state?.structure?.fields?.nodes??[]).filter(n=>collectionKinds.includes(n.kind)).map(n=>n.id)])];
export function fail(message,status=422,field){const e=new Error(message);e.status=status;if(field)e.diagnostics=[{field,message}];throw e;}
export function check(ok,message,status=422,field){if(!ok)fail(message,status,field);}
export function plain(x){check(x&&Object.getPrototypeOf(x)===Object.prototype,'Invalid form data.');}
const bad=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const fieldNames={title:'Title',summary:'Summary',context:'Context',work:'Our work',client:'Client',results:'Results',cover:'Cover photo',image:'Photo',gallery:'Gallery',email:'Email address',name:'Name',text:'Message',message:'Message',cv:'Resume',facts:'Contact details',subject:'Subject',signature:'Signature',start:'Start date',end:'End date',date:'Date',venue:'Venue',city:'City',description:'Description',link:'Link',video:'Video link',audio:'Audio link',outlet:'Publication',url:'Link',quote:'Quote'};
export function text(x,max,field,required=true){check(typeof x==='string'&&x.length<=max&&!bad.test(x)&&(!required||x.trim()),`${fieldNames[field]??field}: ${required?'required; ':''}use no more than ${max} characters.`,422,field);return x.trim();}
export function email(x){const v=text(x,254,'email').toLowerCase();check(/^[^\s@?&#%\r\n]+@[^\s@?&#%\r\n]+\.[^\s@?&#%\r\n]+$/.test(v),'Enter a valid email address.',422,'email');return v;}
export function address(title,reserved){let base=title.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/œ/g,'oe').replace(/æ/g,'ae').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');if(!/^[a-z]/.test(base))base='etude-'+base;base=(base||'etude').slice(0,80).replace(/-+$/,'');let value=base,n=2;while(reserved.includes(value))value=base+'-'+n++;return value;}
const limits={title:160,summary:240,client:90,context:4000,work:4000,results:1500,date:16,start:16,end:16,venue:90,city:90,description:1500,link:300,video:300,audio:300,outlet:90,url:300,quote:200};
const allowed={case:['title','summary','cover','client','context','work','gallery','results'],works:['title','date','summary','image','client','gallery','video','audio','link'],events:['title','start','end','venue','city','description','image','link'],press:['title','outlet','date','url','quote']};
export function draftFields(section,input,previous={},state){
 plain(input);const kind=group(section,state);check(kind,'Section not found.',404);check(Object.keys(input).every(k=>allowed[kind].includes(k)),'Unknown field.');
 const result=clone(input);text(result.title,kind==='press'?160:90,'title');
 for(const [k,v]of Object.entries(result))if(k in limits)text(v,limits[k],k,false);
 const image=(pic,field,old)=>{if(pic==null)return null;plain(pic);check(Object.keys(pic).every(k=>['mediaId','alt','caption','credit'].includes(k)),'Invalid image.',422,field);text(pic.mediaId,100,field);text(pic.alt??'',200,field,false);const same=old?.mediaId===pic.mediaId?old:{};return {...same,...pic};};
 for(const k of ['cover','image'])if(k in result)result[k]=image(result[k],k,previous[k]);
 if('gallery'in result){check(Array.isArray(result.gallery)&&result.gallery.length<=12,'A gallery can contain up to 12 photos.',422,'gallery');result.gallery=result.gallery.map(p=>image(p,'gallery',previous.gallery?.find(old=>old.mediaId===p.mediaId)));}
 return result;
}
const imageToV2=p=>p?{caption:'',credit:'',...p,mediaId:p.assetId,assetId:undefined}:null;
const imageToCase=p=>p?{assetId:p.mediaId,alt:p.alt,caption:p.caption??'',credit:p.credit??''}:null;
export function fieldsFromCase(content){const f={title:'',summary:'',client:'',context:'',work:'',results:'',...clone(content)};if(f.cover){f.cover=imageToV2(f.cover);delete f.cover.assetId;}f.gallery=(f.gallery??[]).map(p=>{p=imageToV2(p);delete p.assetId;return p;});return f;}
function toCase(item,fields){return {id:item.publicId,slug:item.slug,status:'published',content:{...fields,cover:imageToCase(fields.cover),gallery:(fields.gallery??[]).map(imageToCase),client:fields.client??'',results:fields.results??''}};}
export function homeFields(home){return { ...Object.fromEntries(Object.entries({...editorialDefaults,...home.editorial}).map(([k,v])=>['editorial_'+k,v])), ...Object.fromEntries(Object.entries({...navigationDefaults,...home.navigation}).map(([k,v])=>['navigation_'+k,v])),announcementTitle:home.announcement.title,announcementText:home.announcement.text,announcementLink:home.announcement.link,gramLabel:home.gram.label,gramUrl:home.gram.url};}
export function setPage(site,name,fields){if(name==='home')site.home={editorial:Object.fromEntries(Object.entries(fields).filter(([k])=>k.startsWith('editorial_')).map(([k,v])=>[k.slice(10),v])),navigation:Object.fromEntries(Object.entries(fields).filter(([k])=>k.startsWith('navigation_')).map(([k,v])=>[k.slice(11),v])),announcement:{title:fields.announcementTitle,text:fields.announcementText,link:fields.announcementLink??''},gram:{label:fields.gramLabel,url:fields.gramUrl??''}};else site[name]=clone(fields);}
export function migrate(site,cases,legacy,now){
 prepareSiteContent(site);preparePublicCases(cases);const catalog=migrateCatalog(legacy,cases);
 const media=clone(site.media);const remap={};for(const a of catalog.media){let id=a.id;if(media.some(m=>m.id===id&&m.base64!==a.base64))id=uid('m');remap[a.id]=id;if(!media.some(m=>m.id===id))media.push({...a,id});}
 const fields=c=>{const f=fieldsFromCase(c);for(const p of [f.cover,...f.gallery].filter(Boolean))p.mediaId=remap[p.mediaId]??p.mediaId;return f;};
 const items=catalog.records.map(r=>{const live=cases.cases.find(x=>x.id===r.id);return {id:uid('case'),publicId:r.id,slug:r.slug,section:'case-studies',revision:r.draft.revision,fields:fields(r.draft.content),live:live?fields(live.content):null,legacy:clone(r),previousVersions:Object.fromEntries(['selected','lastSelection','recoveryDraft'].filter(k=>r[k]).map(k=>[k,fields(r[k].content)]))};});
 // Preserve public cases even if an old catalogue omitted them.
 for(const live of cases.cases)if(!items.some(x=>x.publicId===live.id&&x.section==='case-studies'))items.push({id:uid('case'),publicId:live.id,slug:live.slug,section:'case-studies',revision:1,fields:fields(live.content),live:fields(live.content)});
 for(const g of ['works','events','press'])for(const data of site[g]){const {id,rubric,demo,...f}=data;items.push({id:uid(g),publicId:id,slug:id,section:rubric,revision:1,fields:clone(f),live:clone(f),demo:!!demo});}
 const pages=Object.fromEntries(['home','about','contact','join','intros'].map(n=>{const f=n==='home'?homeFields(site.home):clone(site[n]??{});return[n,{revision:1,fields:f,live:clone(f)}]}));
 const structure=prepareStructure(site.structure,site.home);
 return {schemaVersion:2,structure:{revision:1,fields:structure,live:clone(structure)},items,media,pages,base:clone(site),reserved:items.flatMap(x=>[x.slug,x.publicId]),people:['local@example.invalid'],settings:{notifications:{cv:true,msg:true},signature:''},conversations:[],attachments:[],outbox:[],journal:[],publishes:[],release:null,createdAt:now};
}
export function snapshots(state){
 const site=clone(state.base);site.structure=clone(state.structure?.live??prepareStructure(site.structure,site.home));site.works=[];site.events=[];site.press=[];
 const cases={schemaVersion:1,cases:[],media:[]};
 for(const item of state.items.filter(x=>x.live)){if(item.section==='case-studies')cases.cases.push(toCase(item,item.live));else site[group(item.section,state)].push({...clone(item.live),id:item.publicId,rubric:item.section,...(item.demo?{demo:true}:{})});}
 for(const[n,p]of Object.entries(state.pages))setPage(site,n,p.live);
 const usedCase=new Set(cases.cases.flatMap(c=>[c.content.cover,...c.content.gallery]).filter(Boolean).map(p=>p.assetId));cases.media=state.media.filter(m=>usedCase.has(m.id)).map(({id,mime,base64})=>({id,mime,base64}));
 const used=new Set();const scan=x=>{if(!x||typeof x!=='object')return;if(x.mediaId)used.add(x.mediaId);for(const v of Object.values(x))scan(v);};scan([site.works,site.events,site.about]);for(const id of [...used])if(state.media.some(m=>m.id===id+'-pixel'))used.add(id+'-pixel');site.media=state.media.filter(m=>used.has(m.id));
 const marked=x=>!!x&&typeof x==='object'&&(x.demo===true||Object.values(x).some(marked));
 const {demo:previousDemo,...content}=site;site.demo=marked(content);
 prepareSiteContent(site);preparePublicCases(cases);return {site,cases};
}
export function status(item){return !item.live?'draft':isDeepStrictEqual(item.fields,item.live)?'live':'changed';}
export function revision(item,value){check(Number.isSafeInteger(value)&&value===item.revision,'This content changed in another window. Your text is still here.',409);}
export function mediaView(state){return Object.fromEntries(state.media.map(m=>[m.id,`/api/v2/media/${m.id}`]));}
export function viewItem(state,item){return {id:item.id,revision:item.revision,status:status(item),fields:clone(item.fields),media:mediaView(state)};}
export function log(state,action,at,actor='local'){state.journal.push({id:uid('log'),at,action,actor});if(state.journal.length>10000)state.journal.shift();}
