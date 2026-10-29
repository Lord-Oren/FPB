import {pages as legacyPages} from './pages.js';
export const zones=[{id:'menus',title:'Frog menus'},{id:'screens',title:'Lily-pad screens'},{id:'stones',title:'Stone links'},{id:'footer',title:'Footer links'},{id:'archive',title:'Hidden sections'}];
export const collectionKinds=['works','events','press'];
export const kinds=['menu','page','link','anchor',...collectionKinds,'case-studies','about','contact','join','legal','croak'];
const internal=/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const clean=s=>typeof s==='string'&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(s);
function require(ok,message){if(!ok)throw new Error(message);}
export function defaultStructure(home={}){
 const names=home.navigation??{};const nodes=[];
 const add=(id,title,kind,zone,parentId=null,extra={})=>nodes.push({id,title:names[id]??title,kind,zone,parentId,slug:['link','anchor'].includes(kind)?'':id,visible:true,newTab:id==='gram',text:'',href:'',...extra});
 for(const [id,title]of [['advertising','Advertising'],['creative','Creative'],['pr','PR']])add(id,title,'menu','menus');
 for(const page of legacyPages){
  let kind=['about','contact','join','legal','croak','case-studies'].includes(page.slug)?page.slug:page.slug==='events-shows'||page.slug==='events-launches'?'events':['press','media-relations','influencer-relations'].includes(page.slug)?'press':'works';
  const parentId=page.hidden?null:page.group==='Advertising'?'advertising':page.group==='Creative'?'creative':page.group==='PR'?'pr':null;
  const zone=page.hidden?'archive':parentId?'menus':['gram','croak'].includes(page.slug)?'screens':'stones';
  add(page.slug,page.title,kind,zone,parentId,{visible:!page.hidden});
 }
 add('announcements','Announcements','anchor','screens',null,{href:'#news'});add('recents','Recents','anchor','screens',null,{href:'#latest'});
 for(const title of ['Instagram','LinkedIn','Vimeo','YouTube'])add('footer-'+title.toLowerCase(),title,'link','footer');
 add('footer-legal','Legal','link','footer',null,{href:'legal.html'});
 const ordered=[];const walk=n=>{ordered.push(n);nodes.filter(c=>c.parentId===n.id).sort((a,b)=>a.title.localeCompare(b.title,'en')).forEach(walk);};
 for(const z of zones){const roots=nodes.filter(n=>n.parentId===null&&n.zone===z.id);roots.sort((a,b)=>z.id==='screens'?(['announcements','recents','gram','croak'].indexOf(a.id)-['announcements','recents','gram','croak'].indexOf(b.id)):a.title.localeCompare(b.title,'en'));roots.forEach(walk);}
 return {schemaVersion:1,nodes:ordered};
}
export function prepareStructure(value,home={}){
 const tree=structuredClone(value??defaultStructure(home));require(tree&&tree.schemaVersion===1&&Array.isArray(tree.nodes)&&tree.nodes.length<=200,'Site structure: up to 200 sections.');
 require(Object.keys(tree).every(k=>['schemaVersion','nodes'].includes(k)),'Unknown structure field.');
 const ids=new Set(),slugs=new Set(['index']);
 for(const n of tree.nodes){
  require(n&&Object.keys(n).every(k=>['id','title','kind','zone','parentId','slug','visible','newTab','text','href'].includes(k)),'Unknown section field.');
  require(typeof n.id==='string'&&internal.test(n.id)&&n.id.length<=100&&!ids.has(n.id),'Invalid or duplicate section ID.');ids.add(n.id);
  require(clean(n.title)&&n.title.trim()&&n.title.length<=60,'Section name: use 1–60 characters.');n.title=n.title.trim();
  require(kinds.includes(n.kind),'Unknown content type.');require(zones.some(z=>z.id===n.zone),'Unknown site zone.');
  require(n.parentId===null||typeof n.parentId==='string','Invalid parent section.');require(typeof n.visible==='boolean','Invalid visibility.');n.newTab??=n.id==='gram';require(typeof n.newTab==='boolean','Invalid tab setting.');
  require(clean(n.text)&&n.text.length<=12000,'Page text: up to 12,000 characters.');require(clean(n.href)&&n.href.length<=300,'Invalid section link.');
  if(['link','anchor'].includes(n.kind)){require(n.slug==='','Links cannot reserve page addresses.');if(n.href){if(n.href.startsWith('https://')){const u=new URL(n.href);require(!u.username&&!u.password,'Links cannot include credentials.');}else require(/^(?:[a-z][a-z0-9-]*\.html(?:#[a-z0-9-]+)?|#[a-z0-9-]+)$/.test(n.href),'Use an HTTPS link or an existing page.');}}
  else{require(internal.test(n.slug)&&n.slug.length<=100&&!slugs.has(n.slug)&&!n.slug.startsWith('case-study-'),'Invalid or duplicate page address.');slugs.add(n.slug);}
 }
 const map=new Map(tree.nodes.map(n=>[n.id,n]));
 for(const n of tree.nodes){let p=n,seen=new Set([n.id]),depth=0;while(p.parentId){const parent=map.get(p.parentId);require(parent&&!seen.has(parent.id),'A section cannot contain itself, and its parent must exist.');require(parent.kind==='menu'&&parent.zone==='menus','Only frog menus can contain subsections.');seen.add(parent.id);p=parent;require(++depth<=12,'Use no more than 12 nested levels.');}n.zone=p.zone;require(n.kind!=='menu'||n.zone==='menus','Menus belong in the frog menu zone.');}
 return tree;
}
export function children(tree,id=null,zone){return tree.nodes.filter(n=>n.parentId===id&&(!zone||n.zone===zone));}
export function visibleNode(tree,node){const map=new Map(tree.nodes.map(n=>[n.id,n]));for(let p=node;p;p=map.get(p.parentId)){if(!p.visible||p.zone==='archive')return false;}return true;}
export function nodeHref(node){return ['link','anchor'].includes(node.kind)?node.href:`${node.slug}.html`;}
export function structurePages(tree){return tree.nodes.filter(n=>!['link','anchor'].includes(n.kind)).map(n=>({slug:n.slug,title:n.title,section:n.id,kind:n.kind,group:n.parentId?tree.nodes.find(x=>x.id===n.parentId)?.title:zones.find(z=>z.id===n.zone)?.title,hidden:!visibleNode(tree,n),node:n}));}
