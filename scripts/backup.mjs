// Authenticated encryption; never pass a password in command-line arguments or logs.
import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {readFile,writeFile,mkdir,stat,open,rm,mkdtemp,rename} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';
const magic=Buffer.from('FPB1');
export async function encryptDump(input,output,key){
 if(key.length!==32)throw Error('A 32-byte backup key is required.');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(magic);
 const handle=await open(output,'wx',0o600);await handle.write(Buffer.concat([magic,iv]));await handle.close();
 try{await pipeline(createReadStream(input),cipher,createWriteStream(output,{flags:'a',mode:0o600}));const f=await open(output,'a');try{await f.write(cipher.getAuthTag());}finally{await f.close();}}catch(e){await rm(output,{force:true});throw e;}
}
export async function decryptDump(input,output,key){
 const info=await stat(input);if(info.size<32)throw Error('Invalid backup.');
 const f=await open(input,'r');let header,tag;
 try{header=Buffer.alloc(16);tag=Buffer.alloc(16);await f.read(header,0,16,0);await f.read(tag,0,16,info.size-16);}finally{await f.close();}
 if(!header.subarray(0,4).equals(magic))throw Error('Invalid backup format.');
 const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(4));decipher.setAAD(magic);decipher.setAuthTag(tag);
 const temporary=output+'.partial-'+randomBytes(6).toString('hex');
 try{await pipeline(createReadStream(input,{start:16,end:info.size-17}),decipher,createWriteStream(temporary,{flags:'wx',mode:0o600}));await rename(temporary,output);}finally{await rm(temporary,{force:true});}
}
const command=(name,args,env)=>new Promise((resolve,reject)=>{const child=spawn(name,args,{env,stdio:['ignore','ignore','ignore']});const timer=setTimeout(()=>child.kill('SIGKILL'),180000);child.on('error',()=>{clearTimeout(timer);reject(Error('Backup tool unavailable.'));});child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Backup or restore command failed.'));});});
async function main(){
 const [action,target]=process.argv.slice(2);if(!['create','verify','restore-test'].includes(action)||!target)throw Error('Usage: backup.mjs create|verify|restore-test FILE');
 const keyPath=process.env.POND_BACKUP_KEY_FILE;if(!keyPath)throw Error('Configure POND_BACKUP_KEY_FILE outside the repository.');
 const key=await readFile(keyPath);if(key.length!==32||(await stat(keyPath)).mode&0o077)throw Error('Backup key must be 32 bytes and private (0600).');
 const temp=await mkdtemp(path.join(os.tmpdir(),'fpb-backup-'));const dump=path.join(temp,'database.dump');
 try{
  if(action==='create'||action==='restore-test'){
   const url=new URL(process.env.DATABASE_URL);if(!['postgres:','postgresql:'].includes(url.protocol))throw Error('A database URL is required.');
   const db=decodeURIComponent(url.pathname.slice(1));
   if(action==='restore-test'&&(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^fpb_restore_[a-z0-9_]+$/.test(db)))throw Error('Restore is restricted to a named loopback test database.');
   const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:db,PGSSLMODE:action==='restore-test'?'disable':'verify-full',PGSSLROOTCERT:'/etc/ssl/certs/ca-certificates.crt'};
   if(action==='create'){if(env.POND_BACKUP_SNAPSHOT&&!/^[0-9A-Fa-f-]+$/.test(env.POND_BACKUP_SNAPSHOT))throw Error('Invalid snapshot identifier.');await command('pg_dump',['-Fc','--no-owner','--no-acl',...(env.POND_BACKUP_SNAPSHOT?['--snapshot='+env.POND_BACKUP_SNAPSHOT]:[]),'-f',dump],env);await encryptDump(dump,target,key);}
   else{await decryptDump(target,dump,key);await command('pg_restore',['--no-owner','--no-acl','--exit-on-error','-d',db,dump],env);}
  }else{await decryptDump(target,dump,key);await command('pg_restore',['--file=/dev/null',dump],process.env);}
  console.log(JSON.stringify({action,status:'verified',file:path.basename(target)}));
 }finally{await rm(temp,{recursive:true,force:true});}
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Backup operation failed. Check local configuration and database access; no credentials are logged.');process.exitCode=1;});
