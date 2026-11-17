// Disposable integration-test process. Never used by the production entry point.
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHosted} from '../../editor/hosted.mjs';
import {openPostgres} from '../../editor/backend/postgres.mjs';
import {openPublishedReader} from '../../editor/backend/published-reader.mjs';
import {startHostedHandover} from '../../editor/backend/handover.mjs';
import {deploymentConfig} from '../../hosting/config.mjs';
const root=process.env.POND_TEST_ROOT,database=process.env.POND_TEST_DATABASE_URL;
if(new URL(database).hostname!=='127.0.0.1'||!root?.startsWith('/tmp/fpb-handover-'))throw Error('Disposable local fixture required.');
let hold=process.env.POND_TEST_HOLD==='yes',release=null,fail=false;
process.on('message',m=>{if(m==='hold')hold=true;if(m==='fail')fail=true;if(m==='release'){hold=false;release?.();release=null;}});
const builder=async(r,folder,id,pub,{onProgress=()=>{}}={})=>{
 onProgress('build-a');process.send?.({event:'building',id});
 if(hold)await new Promise(resolve=>{release=resolve;});
 if(fail)throw Error('Fixture build failure');
 for(const v of ['a','b']){onProgress('build-'+v);const d=path.join(folder,'releases',id,v);await mkdir(d,{recursive:true});await writeFile(path.join(d,'index.html'),'<!doctype html><title>'+pub.site.home.announcement.title+'</title><script>window.fixture=true</script>');onProgress('check-'+v);}
};
const opts={connectionString:database,ssl:false};
const app=await startHostedHandover({root,port:0,builder,createApp:createHosted,openWriter:()=>openPostgres(opts),openReader:()=>openPublishedReader(opts),waitMs:30000,pollMs:25,
 hosted:{originHost:'fixture.onrender.com',config:deploymentConfig({POND_PUBLIC_SITE:'true',POND_PUBLIC_B:'true',POND_PREVIEW_HOST:'b.frogpondboys.com'}),testers:['alice@example.test'],verify:async token=>{if(token!=='test-only')throw Error('Access token required.');return {email:'alice@example.test'};}},onEvent:e=>process.send?.(e)});
process.send?.({event:'listening',port:app.server.address().port});
let stopping=false;
process.on('SIGTERM',()=>{stopping=true;hold=false;release?.();app.close().then(()=>process.exit(0),()=>process.exit(1));});
try{await app.ready;}catch(error){if(!stopping){process.send?.({event:'startup-failed',code:error.code??error.name});process.exit(1);}}
