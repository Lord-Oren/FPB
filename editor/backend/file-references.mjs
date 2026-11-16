// Walk metadata only: snapshots may contain pooled image references, never hydrate them for authorization.
export function referencedFiles(snapshot) {
 const refs=new Map();
 function walk(value) { if(!value||typeof value!=='object')return;
  for(const [key,item] of Object.entries(value)) {
   if(['documentId','videoId'].includes(key)&&item) {
    const kind=key==='videoId'?'video':'pdf';
    if(!/^file-[a-f0-9]{24}$/.test(item)||refs.has(item)&&refs.get(item)!==kind)throw Error('Invalid published file reference.');
    refs.set(item,kind);
   } else if(typeof item==='object')walk(item);
  }
 }
 walk(snapshot);return refs;
}
export function approvedFiles(snapshot,files=[]) {
 const approved={};
 for(const [id,kind] of referencedFiles(snapshot)) {
  const file=files.find(f=>f.id===id);
  if(!file||file.kind!==kind)throw Error('A published file has no checked metadata.');
  approved[id]=kind;
 }
 return approved;
}
