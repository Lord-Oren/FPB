// Shared by the local editor UI and server. No browser or Node dependency.
export const contentLimits={title:90,summary:240,context:4000,work:4000,client:90,results:1500,alt:200,caption:200,credit:120};
export function contentDiagnostics(content,caseId,{complete=true,media=[]}={}) {
 const issues=[];const add=(field,code,extra={})=>issues.push({caseId,field,code,...extra});
 if(!content || typeof content!=='object' || Array.isArray(content)){add('content','invalid_type');return issues;}
 const text=(value,key,field,required,index)=>{
  const extra=index?{index}:{};
  if(typeof value!=='string'){add(field,required && value===undefined?'required':'invalid_type',extra);return;}
  if(required&&!value.trim())add(field,'required',extra);
  if(value.length>contentLimits[key])add(field,'too_long',{...extra,maximum:contentLimits[key],length:value.length});
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value))add(field,'forbidden_character',extra);
 };
 for(const field of ['title','summary','context','work','client','results'])text(content[field]??'',field,field,complete&&!['client','results'].includes(field));
 const image=(value,field,index)=>{
  const extra=index?{index}:{};
  if(!value || typeof value!=='object' || Array.isArray(value)){add(field,'missing_image',extra);return;}
  if(!media.some(asset=>asset.id===value.assetId))add(field,'missing_image',extra);
  for(const key of ['alt','caption','credit'])text(value[key]??'',key,`${field}.${key}`,complete&&key==='alt',index);
 };
 if(content.cover || complete)image(content.cover,'cover');
 if(!Array.isArray(content.gallery))add('gallery','invalid_type');
 else {if(content.gallery.length>12)add('gallery','too_many',{maximum:12,length:content.gallery.length});content.gallery.forEach((value,i)=>image(value,'gallery',i+1));}
 return issues;
}
export function diagnosticLabel(issue){
 const names={newTitle:'New case study title',title:'Title',summary:'Summary',context:'Context',work:'Our work',client:'Client',results:'Results',cover:'Cover',gallery:'Gallery',slug:'Address',content:'Content'};
 const parts=issue.field.split('.');const base=parts[0]==='gallery'&&issue.index?`Gallery image ${issue.index}`:names[parts[0]]||'Item';
 return parts[1]?`${base} — ${{alt:'Image description',caption:'Caption',credit:'Credit'}[parts[1]]||parts[1]}`:base;
}
export function diagnosticMessage(issue){return ({required:'required',too_long:`${issue.length} characters; limit ${issue.maximum}`,forbidden_character:'control or text-direction character is not allowed',missing_image:'image missing',image_refused:'image rejected; use a non-animated PNG, JPEG, or WebP',address_used:'address already reserved',too_many:`${issue.length} images; limit ${issue.maximum}`,invalid_type:'invalid value'})[issue.code]||'invalid value';}
export function diagnosticTarget(issue){
 if(issue.field==='newTitle')return 'new-title';if(issue.field==='slug')return 'field-slug';if(issue.field==='cover')return 'cover-file';if(issue.field==='gallery')return 'gallery-files';
 if(issue.field.startsWith('cover.'))return 'field-'+issue.field.split('.')[1];
 if(issue.field.startsWith('gallery.'))return `gallery-${issue.index}-${issue.field.split('.')[1]}`;
 return 'field-'+issue.field;
}
