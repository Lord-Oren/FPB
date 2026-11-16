// Original bytes stay private. Only rebuilt/decoded bytes can be previewed by an authenticated team member.
import sharp from 'sharp';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run} from './publisher.mjs';
import {validateAttachmentEnvelope,JOIN_MAX_BYTES} from './attachment-policy.mjs';
import {prepareUpload,imagePdf} from './public-files.mjs';
import {check,uid} from './model.mjs';
export async function prepareJoinFile(body,folder){
 const original=validateAttachmentEnvelope(body,{allowDocx:true});let safe;
 if(original.kind==='image'){
  const options={limitInputPixels:16_000_000};const meta=await sharp(original.bytes,options).metadata();
  check(['png','jpeg','webp'].includes(meta.format)&&(meta.pages??1)===1,'Use a non-animated PNG, JPEG or WebP image.');
  const bytes=await sharp(original.bytes,options).rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
  safe={bytes,mime:'image/webp',kind:'image'};
 }else if(original.kind==='document'){
  const stage=await mkdtemp(path.join(folder,'docx-'));
  try{
   const input=path.join(stage,'input.docx');await writeFile(input,original.bytes,{mode:0o600});
   const text=JSON.parse(await run('prlimit',['--as=268435456','--cpu=10','--','python3',fileURLToPath(new URL('./docx-text.py',import.meta.url)),input]));
   const lines=text.split('\n').flatMap(line=>line.match(/.{1,85}/gu)||['']);check(lines.length<=2500,'This Word document is too long.');
   const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));const images=[];
   for(let i=0;i<lines.length;i+=55){const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="850" height="1100"><rect width="100%" height="100%" fill="white"/><g font-family="DejaVu Sans" font-size="15" fill="black">${lines.slice(i,i+55).map((line,j)=>`<text x="35" y="${40+j*19}">${escape(line)}</text>`).join('')}</g></svg>`;images.push({width:850,height:1100,bytes:await sharp(Buffer.from(svg)).jpeg().toBuffer()});}
   safe={kind:'pdf',mime:'application/pdf',bytes:imagePdf(images)};
  }catch{check(false,'This Word document cannot be processed. Please save it as PDF or send a link.',422);}
  finally{await rm(stage,{recursive:true,force:true});}
 }else safe=await prepareUpload(body,folder);
 check(safe.bytes.length<=JOIN_MAX_BYTES,'The processed attachment is too large.');
 return {id:uid('attachment'),name:original.name,previewName:original.name.replace(/\.[^.]+$/,'')+(safe.kind==='pdf'?'.pdf':safe.kind==='image'?'.webp':original.name.match(/\.[^.]+$/)?.[0]??''),size:safe.bytes.length,mime:safe.mime,kind:safe.kind,state:'clean',bytes:safe.bytes,original:original.bytes};
}
