// Intake policy only. A matching signature never grants a clean verdict.
// Files remain quarantined until the T3 processing and storage pipeline approves them.
export const JOIN_MAX_BYTES=10*1024*1024;
export const FILE_TOO_LARGE_MESSAGE='This file is too large (10 MB maximum). Please send a link instead, or contact us by email.';
export function attachmentError(code,message,status=422){return Object.assign(new Error(message),{code,status});}
export function validateAttachmentEnvelope({name,base64}){
 if(typeof name!=='string'||name.length>160||!name.trim()||/[\x00-\x1f\x7f/\\]/.test(name))throw attachmentError('invalid_file','Use a valid filename.');
 if(typeof base64!=='string')throw attachmentError('invalid_file','The file could not be read.');
 if(base64.length>4*Math.ceil(JOIN_MAX_BYTES/3))throw attachmentError('file_too_large',FILE_TOO_LARGE_MESSAGE,413);
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw attachmentError('invalid_file','The file could not be read.');
 const bytes=Buffer.from(base64,'base64');
 if(bytes.length>JOIN_MAX_BYTES)throw attachmentError('file_too_large',FILE_TOO_LARGE_MESSAGE,413);
 if(bytes.toString('base64')!==base64)throw attachmentError('invalid_file','The file could not be read.');
 let kind;
 if(bytes.subarray(0,5).toString()==='%PDF-'&&/\.pdf$/i.test(name))kind='pdf';
 else if(bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))&&/\.png$/i.test(name))kind='image';
 else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&/\.jpe?g$/i.test(name))kind='image';
 else if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'&&/\.webp$/i.test(name))kind='image';
 else if(bytes.subarray(4,8).toString()==='ftyp'&&/\.mp4$/i.test(name))kind='video';
 else if(bytes.subarray(0,4).equals(Buffer.from('1a45dfa3','hex'))&&/\.webm$/i.test(name))kind='video';
 else if(/\.docx?$/i.test(name))throw attachmentError('unsupported_file','Word files are not supported yet. Please send a PDF or a link instead.');
 if(!kind)throw attachmentError('unsupported_file','Choose a PDF, PNG, JPEG, WebP, MP4 or WebM file with matching contents.');
 return {name,kind,bytes,state:'quarantine'};
}
export function validatePortfolioUrl(value=''){
 if(value==='')return '';
 try{const url=new URL(value);if(typeof value!=='string'||value.length>300||url.protocol!=='https:'||url.username||url.password)throw Error();return url.href;}
 catch{throw attachmentError('invalid_link','Use an HTTPS link without a username or password.');}
}
