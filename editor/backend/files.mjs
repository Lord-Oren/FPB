// Bounded image decoding and PDF structural checks. PDF acceptance does not remove quarantine.
import sharp from 'sharp';
// Keep native image memory bounded on the free 512 MiB runtime.
sharp.cache(false);sharp.concurrency(1);
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {run} from './publisher.mjs';
import {check,uid,text} from './model.mjs';
export function decode(base64,max){check(typeof base64==='string'&&base64.length<=Math.ceil(max/3)*4&&/^[A-Za-z0-9+/]+={0,2}$/.test(base64),'This file is invalid or too large.',413);const b=Buffer.from(base64,'base64');check(b.length<=max&&b.toString('base64')===base64,'Invalid file.');return b;}
export async function image(body){const data=decode(body.base64,5*1024*1024);try{const meta=await sharp(data,{limitInputPixels:40_000_000}).metadata();check(['png','jpeg','webp'].includes(meta.format)&&(meta.pages??1)===1,'This photo is not supported.');const result=await sharp(data,{limitInputPixels:40_000_000}).rotate().resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).webp({quality:80}).toBuffer();check(result.length<=600*1024,'This photo is still too large.');return {id:uid('image'),mime:'image/webp',base64:result.toString('base64')};}catch{check(false,'Choose a non-animated PNG, JPEG, or WebP image up to 5 MiB.',422,'image');}}
export async function pdf(body,folder){
 const name=text(body.name,160,'cv');check(/\.pdf$/i.test(name)&&!/[\r\n/\\]/.test(name),'Use a valid filename ending in .pdf for the resume.',422,'cv');
 const bytes=decode(body.base64,5*1024*1024);check(bytes.subarray(0,5).toString()==='%PDF-','The resume must be a valid PDF file.',422,'cv');
 const stage=await mkdtemp(path.join(folder,'pdf-'));try{const file=path.join(stage,'cv.pdf');await writeFile(file,bytes,{mode:0o600});const info=await run('pdfinfo',[file]);const pages=Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);check(pages>=1&&pages<=100&&!/^Encrypted:\s+yes/m.test(info),'The PDF cannot be read, is password-protected, or has more than 100 pages.',422,'cv');
 // Parsing and quarantine are distinct. No clean verdict is invented without a scanner.
 return {id:uid('cv'),name,size:`${Math.ceil(bytes.length/1024)} KB`,base64:bytes.toString('base64'),state:'quarantine',pages};
 }catch(error){check(false,'Could not check this resume. Use a readable PDF without a password. If it still fails, contact the site manager.',422,'cv');}finally{await rm(stage,{recursive:true,force:true});}
}
