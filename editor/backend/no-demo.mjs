// Fingerprints identify pristine shipped records. Unknown or edited content is
// kept; matching words in a client's text are never grounds for deleting it.
import {createHash} from 'node:crypto';
import {aboutDefaults,contactDefaults} from '../../src/data/page-fields.js';
import baseline from './legacy-fingerprints.json' with {type:'json'};
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const fingerprint=x=>createHash('sha256').update(JSON.stringify(canonical(unmark(x)))).digest('hex');
export function unmark(x){if(Array.isArray(x))return x.map(unmark);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).filter(([k])=>k!=='demo').map(([k,v])=>[k,unmark(v)]));return x;}
const fields=record=>Object.fromEntries(Object.entries(record).filter(([k])=>!['id','rubric','demo'].includes(k)));
export const pristineMedia=media=>baseline.media[media.id]===fingerprint({mime:media.mime,base64:media.base64});
export function unchangedPictures(value,media){const ids=[];const scan=x=>{if(!x||typeof x!=='object')return;if(x.mediaId)ids.push(x.mediaId);Object.values(x).forEach(scan);};scan(value);return ids.every(id=>{const m=media.find(m=>m.id===id);return m&&pristineMedia(m);});}
export const pristineRecord=(id,value)=>baseline.records[id]===fingerprint(value);
export function cleanSite(input,report=[]){
 const site=structuredClone(input);
 site.about={...structuredClone(aboutDefaults),...site.about};site.contact={...contactDefaults,...site.contact};
 for(const group of ['works','events','press'])site[group]=site[group].filter(record=>{
  if(!record.demo)return true;
  if(pristineRecord(record.id,fields(record))&&unchangedPictures(record,site.media))return false;
  report.push({kind:group,id:record.id,action:'kept-edited'});return true;
 });
 for(const [parent,key,known]of [[site.about,'team',baseline.team],[site.about,'photos',baseline.photos],[site.join,'positions',baseline.jobs]])parent[key]=(parent[key]??[]).filter(v=>!known.includes(fingerprint(v))||(key==='photos'&&site.media.some(m=>m.id===v.mediaId&&baseline.media[m.id]!==fingerprint({mime:m.mime,base64:m.base64}))));
 for(const job of site.join.positions)if(job.type==='Demo — opportunities')job.type='';
 if(site.contact.email===baseline.email)site.contact.email='';
 if(fingerprint(site.home.announcement)===fingerprint(baseline.home.announcement)||fingerprint(site.home.announcement)===fingerprint({title:'Announcements',text:'News from the studio.',link:''}))site.home.announcement={title:'',text:'',link:''};
 if(site.home.gram.label===baseline.home.gram.label)site.home.gram.label='Ribbit.';
 const ed=site.home.editorial??{};
 for(const key of ['croakTitle','croakText','legalPrivacy','legalCookies','legalTerms','legalConduct','legalValues'])if(baseline.editorial?.[key]===fingerprint(ed[key]??''))ed[key]='';
 if(ed.homeLatestKicker==='Latest work')ed.homeLatestKicker='';
 if(['Listen now','Song of the Week'].includes(ed.homeCroakLink))ed.homeCroakLink='Tune in';
 site.home.editorial=ed;
 for(const [key,old,value]of [['recents','Recents','Recent.'],['gram','Gram','Ribbit.'],['croak','Croak','Croak.']])if(site.home.navigation?.[key]===old)site.home.navigation[key]=value;
 site.works=site.works.filter(x=>x.rubric!=='presentations');delete site.intros?.presentations;
 if(site.structure)site.structure.nodes=site.structure.nodes.filter(n=>n.id!=='presentations');
 const used=new Set();const scan=x=>{if(!x||typeof x!=='object')return;if(x.mediaId)used.add(x.mediaId);Object.values(x).forEach(scan);};scan([site.works,site.events,site.about]);
 site.media=site.media.filter(m=>!baseline.media[m.id]||baseline.media[m.id]!==fingerprint({mime:m.mime,base64:m.base64})||used.has(m.id));
 // Rewrite only retained legacy identifiers, consistently across references.
 const replacements=new Map();for(const m of site.media)if(m.id.startsWith('demo-'))replacements.set(m.id,'retained-'+m.id.slice(5));
 const rewrite=x=>{if(Array.isArray(x))return x.map(rewrite);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).filter(([k])=>k!=='demo').map(([k,v])=>[k,['id','mediaId'].includes(k)&&typeof v==='string'?(replacements.get(v)??(v.startsWith('demo-')?'retained-'+v.slice(5):v)):rewrite(v)]));return x;};
 return rewrite(site);
}
