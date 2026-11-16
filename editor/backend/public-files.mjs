// Public uploads are processed before storage. Original PDFs are never served.
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';import sharp from 'sharp';
import {run} from './publisher.mjs';import {check,uid} from './model.mjs';
import {validateAttachmentEnvelope,JOIN_MAX_BYTES} from './attachment-policy.mjs';
export function imagePdf(images){
 const objects=[Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),null];const kids=[];
 for(const [i,image]of images.entries()){
  const page=3+i*3,content=page+1,pic=page+2;kids.push(`${page} 0 R`);
  objects.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${image.width} ${image.height}] /Resources << /XObject << /Im ${pic} 0 R >> >> /Contents ${content} 0 R >>`));
  const drawing=Buffer.from(`q ${image.width} 0 0 ${image.height} 0 0 cm /Im Do Q`);
  objects.push(Buffer.concat([Buffer.from(`<< /Length ${drawing.length} >>\nstream\n`),drawing,Buffer.from('\nendstream')]));
  objects.push(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`),image.bytes,Buffer.from('\nendstream')]));
 }
 objects[1]=Buffer.from(`<< /Type /Pages /Count ${kids.length} /Kids [${kids.join(' ')}] >>`);
 const parts=[Buffer.from('%PDF-1.4\n')],offsets=[0];let length=parts[0].length;
 objects.forEach((obj,i)=>{offsets.push(length);const b=Buffer.concat([Buffer.from(`${i+1} 0 obj\n`),obj,Buffer.from('\nendobj\n')]);parts.push(b);length+=b.length;});
 parts.push(Buffer.from(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`));return Buffer.concat(parts);
}
export async function prepareUpload(body,folder){
 const file=validateAttachmentEnvelope(body);check(['pdf','video'].includes(file.kind),'Use the photo upload for images.');
 const stage=await mkdtemp(path.join(folder,'upload-'));
 try{
  const input=path.join(stage,file.kind==='pdf'?'input.pdf':'input'+path.extname(file.name).toLowerCase());await writeFile(input,file.bytes,{mode:0o600});let bytes,mime;
  if(file.kind==='pdf'){
   const info=await run('prlimit',['--as=268435456','--cpu=15','--','pdfinfo',input]);const pages=Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);check(pages>0&&pages<=100&&!/^Encrypted:\s+yes/m.test(info),'Use a readable PDF without a password, up to 100 pages.');
   check(!/\/(?:JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA|XFA|RichMedia)\b/.test(file.bytes.toString('latin1')),'This PDF contains unsupported active content.');
   // Child resource limits: 512 MiB address space, 32 MiB output file, 90s CPU.
   await run('prlimit',['--as=536870912','--fsize=33554432','--cpu=90','--','pdftoppm','-jpeg','-r','72','-scale-to','1500',input,path.join(stage,'page')]);
   const images=[];let total=0;
   for(const name of (await readdir(stage)).filter(n=>/^page-\d+\.jpg$/.test(n)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))){
    const raw=await readFile(path.join(stage,name));const jpeg=await sharp(raw,{limitInputPixels:4_000_000}).flatten({background:'#ffffff'}).toColourspace('srgb').jpeg().toBuffer();total+=jpeg.length;check(total<=JOIN_MAX_BYTES,'The processed PDF is too large. Please use a smaller file.');const meta=await sharp(jpeg).metadata();images.push({bytes:jpeg,width:meta.width,height:meta.height});
   }
   check(images.length===pages,'Not all PDF pages could be processed.');bytes=imagePdf(images);mime='application/pdf';
  }else{
   const info=JSON.parse(await run('prlimit',['--as=536870912','--cpu=30','--','ffprobe','-v','error','-protocol_whitelist','file,pipe','-show_streams','-show_format','-of','json',input]));
   const streams=info.streams??[];const video=streams.filter(s=>s.codec_type==='video');
   check(video.length===1&&streams.every(s=>['video','audio'].includes(s.codec_type)),'Use a video with one picture stream and optional audio.');
   check(Number(info.format?.duration)>0&&Number(info.format.duration)<=60,'Video length must be no more than 60 seconds.');
   check(video[0].width*video[0].height<=3840*2160,'Video resolution must not exceed 4K.');
   const webm=/\.webm$/i.test(file.name);check((webm?['vp8','vp9']:['h264']).includes(video[0].codec_name)&&streams.filter(s=>s.codec_type==='audio').every(s=>(webm?['opus','vorbis']:['aac']).includes(s.codec_name)),'Use MP4 H.264/AAC or WebM VP8/VP9 with Opus/Vorbis audio.');
   const output=path.join(stage,webm?'safe.webm':'safe.mp4');await run('prlimit',['--as=536870912','--fsize=11534336','--cpu=90','--','ffmpeg','-v','error','-protocol_whitelist','file,pipe','-i',input,'-map','0:v:0','-map','0:a:0?','-c','copy','-map_metadata','-1',output]);bytes=await readFile(output);mime=webm?'video/webm':'video/mp4';
  }
  check(bytes.length<=JOIN_MAX_BYTES,'The processed file is too large.');return {id:uid('file'),name:file.name,mime,size:bytes.length,bytes,kind:file.kind};
 }finally{await rm(stage,{recursive:true,force:true});}
}
