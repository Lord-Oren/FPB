import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,Agent,request} from 'node:http';
import {spawnSync} from 'node:child_process';
import {tuneHttpServer,startupDiagnostic} from '../hosting/http-runtime.mjs';
test('upstream can reuse the same socket after Node default idle timeout',async()=>{
 const server=tuneHttpServer(createServer((req,res)=>res.end('ok'))),agent=new Agent({keepAlive:true,maxSockets:1});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const get=()=>new Promise((resolve,reject)=>{let socket;const r=request({host:'127.0.0.1',port:server.address().port,agent},res=>{res.resume();res.on('end',()=>resolve(socket));});r.on('socket',s=>socket=s);r.on('error',reject);r.end();});
 try{const first=await get();await new Promise(resolve=>setTimeout(resolve,6200));assert.strictEqual(await get(),first);}
 finally{agent.destroy();await new Promise(resolve=>server.close(resolve));}
});
test('startup diagnostics whitelist error codes and never disclose provider messages',()=>{
 const secret='postgres://user:private-value@private-host/db';
 assert.deepEqual(startupDiagnostic({code:'POND_WRITER_BUSY',message:secret},'database'),{event:'pond_startup_failure',stage:'database',code:'POND_WRITER_BUSY'});
 assert(!JSON.stringify(startupDiagnostic({code:secret,message:secret,stack:secret},secret)).includes('private-value'));
 const result=spawnSync(process.execPath,['editor/hosted.mjs'],{env:{PATH:process.env.PATH,DATABASE_URL:secret},encoding:'utf8'});
 assert.equal(result.status,1);assert.equal(JSON.parse(result.stderr.trim()).stage,'configuration');assert(!result.stderr.includes('private-value'));
});
