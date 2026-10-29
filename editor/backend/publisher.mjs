// Build selected static variants in isolation before installing public content; preserve the last good release.
import {cp,mkdir,mkdtemp,readFile,writeFile,rename,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {checkExport} from '../../scripts/check-export.mjs';
import {checkOriginalArtwork} from '../../scripts/check-original-artwork.mjs';
import {validatePublicMedia} from '../../src/data/validate-public-media.js';
import {prepareStructure,structurePages} from '../../src/data/structure.js';
export function run(command,args,options={}){return new Promise((resolve,reject)=>{const p=spawn(command,args,{...options,stdio:['ignore','pipe','pipe']});let out='';p.stdout.on('data',b=>{if(out.length<200000)out+=b});p.stderr.on('data',b=>{if(out.length<200000)out+=b});const timer=setTimeout(()=>p.kill('SIGKILL'),120000);p.on('error',e=>{clearTimeout(timer);reject(e)});p.on('close',code=>{clearTimeout(timer);code===0?resolve(out):reject(new Error(`The site check failed (${command}, ${code}).`))});});}
export async function atomic(file,value){const temp=file+'.tmp';await writeFile(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});await rename(temp,file);}
export async function validateImages(snapshot){await validatePublicMedia(snapshot.cases);await validatePublicMedia({schemaVersion:1,cases:[],media:snapshot.site.media.map(({id,mime,base64})=>({id,mime,base64}))});}
// Build isolated sources; no candidate is installed before all selected variants pass.
export async function buildRelease(root,folder,id,snapshot,{hosted=false,variants=['a','b'],publicSite=false}={}){
 if(!Array.isArray(variants)||!variants.length||variants.some(v=>!['a','b'].includes(v))||new Set(variants).size!==variants.length)throw Error('Invalid publication variants.');
 await validateImages(snapshot);const stage=await mkdtemp(path.join(folder,'build-'));const project=path.join(stage,'astro');
 try{
  await mkdir(project);
  for(const name of ['src','scripts','editor'])await cp(path.join(root,name),path.join(project,name),{recursive:true,filter:f=>!['.local-editor','node_modules','dist','.cache'].includes(path.basename(f))});
  for(const name of ['package.json','package-lock.json','astro.config.mjs'])await cp(path.join(root,name),path.join(project,name));
  await symlink(path.join(root,'node_modules'),path.join(project,'node_modules'),'dir');
  await atomic(path.join(project,'src/data/site-content.json'),snapshot.site);await atomic(path.join(project,'src/data/case-studies-public.json'),snapshot.cases);
  const expectedRoutes=['index.html',...structurePages(prepareStructure(snapshot.site.structure,snapshot.site.home)).map(p=>p.slug+'.html'),...snapshot.cases.cases.map(c=>'case-study-'+c.slug+'.html')];
  for(const variant of variants){
   await run(process.execPath,[path.join(root,'node_modules/astro/bin/astro.mjs'),'build'],{cwd:project,env:{...process.env,FPB_VARIANT:variant,POND_HOSTED_BUILD:hosted&&!publicSite?'1':'',...(hosted?{NODE_OPTIONS:'--max-old-space-size=128'}:{}),ASTRO_TELEMETRY_DISABLED:'1'}});
   await checkExport(path.join(project,'dist'),{expectedRoutes,hostedForms:hosted&&!publicSite});await checkOriginalArtwork(path.join(project,'dist'));await cp(path.join(project,'dist'),path.join(stage,variant),{recursive:true});
  }
  await rm(project,{recursive:true,force:true});await atomic(path.join(stage,'snapshot.json'),snapshot);
  const destination=path.join(folder,'releases',id);await mkdir(path.dirname(destination),{recursive:true});await rename(stage,destination);return destination;
 }catch(error){await rm(stage,{recursive:true,force:true});throw error;}
}
