// Configurable public site and private Desk gateway; verified Access, PostgreSQL, simulated mail.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {errors as joseErrors} from 'jose';
import {accessVerifier} from './backend/access.mjs';
import {openPostgres,hostedDatabaseTls} from './backend/postgres.mjs';
import {createV2} from './backend/api.mjs';
import {buildRelease} from './backend/publisher.mjs';
import {deploymentConfig} from '../hosting/config.mjs';
const safeHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Strict-Transport-Security':'max-age=31536000'};
export async function createHosted({root=fileURLToPath(new URL('../',import.meta.url)),port=Number(process.env.PORT),store,verify,testers,issuer,audience,server:existingServer,sessionSeconds=Number(process.env.POND_SESSION_SECONDS??28800),originHost=process.env.RENDER_EXTERNAL_HOSTNAME,config=deploymentConfig(process.env),builder=(...args)=>buildRelease(...args,{hosted:true,publicSite:config.publicSite,variants:config.publicSite?['a']:['a','b']})}={}){
 const {hosts,www,publicSite}=config;
 if(!Number.isInteger(port)||port<0||port>65535||!store||!testers?.length)throw Error('Hosted configuration incomplete.');
 const checkToken=verify??accessVerifier({issuer,audience,emails:testers});
 const v2=createV2({root,store,maxStateBytes:16*1024*1024,sessionSeconds,hosted:true,testers,publicUrls:{a:'https://'+hosts.a,b:'https://'+hosts.b},builder});
 try{await v2.initialize();}catch(error){await v2.close();await store.close();throw error;}let ready=true;
 const reply=(res,status,message)=>{res.writeHead(status,{...safeHeaders,'Content-Type':'application/json','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"});res.end(JSON.stringify({message}));};
 const handle=async(req,res)=>{
  for(const [k,v]of Object.entries(safeHeaders))res.setHeader(k,v);
  let stage='route';
  try{
   const transportHost=req.headers.host;
   const host=originHost&&transportHost===originHost?req.headers['x-pond-public-host']:transportHost;
   // Provider probes never wake a suspended Neon database. No application data.
   if(req.method==='GET'&&req.url==='/livez')return reply(res,200,'alive');
   if(req.method==='GET'&&req.url==='/healthz')return reply(res,ready?200:503,ready?'ready':'starting');
   if(publicSite&&host===www&&['GET','HEAD'].includes(req.method)){res.writeHead(308,{...safeHeaders,Location:'https://'+hosts.a+req.url});res.end();return;}
   const variant=Object.keys(hosts).find(k=>hosts[k]===host);if(!variant)return reply(res,403,'Access denied.');
   if(req.headers['x-forwarded-proto']!=='https')return reply(res,403,'A secure HTTPS connection is required.');
   if(publicSite&&variant==='b')return reply(res,404,'Page not found.');
   const publicRequest=publicSite&&variant==='a';
   if(publicRequest&&( !['GET','HEAD'].includes(req.method)||req.url.startsWith('/api/')))return reply(res,404,'This action is not available.');
   stage='access';
   if(!publicRequest)req.pondIdentity=await checkToken(req.headers['cf-access-jwt-assertion']);
   stage='application';
   const url=new URL(req.url,'https://'+host);
   const form=req.method==='POST'&&['/api/v2/forms/contact','/api/v2/forms/join'].includes(url.pathname);
   // Access returns users through a cross-site top-level GET navigation.
   // Keep cross-site API requests and all mutations forbidden.
   const accessNavigation=req.method==='GET'&&req.headers['sec-fetch-mode']==='navigate'&&!url.pathname.startsWith('/api/');
   if(!publicRequest&&req.headers['sec-fetch-site']==='cross-site'&&!accessNavigation)return reply(res,403,'This request came from an unapproved page.');
   if(['POST','PUT','DELETE','PATCH'].includes(req.method)&&req.headers.origin!=='https://'+host)return reply(res,403,'This request came from an unapproved page.');
   if(variant!=='desk'){
    if(form)return void await v2.handler(req,res,url);
    if(req.method!=='GET'&&req.method!=='HEAD')return reply(res,405,'This action is not allowed.');
    const filename=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if(!/^[a-z0-9-]+\.html$/.test(filename))return reply(res,404,'Page not found.');
    const release=v2.release();if(!release)return reply(res,503,'The site is starting. Please try again shortly.');
    let html;try{html=await readFile(path.join(root,'.local-editor/v2/releases',release,variant,filename),'utf8');}catch{return reply(res,404,'Page not found.');}
    const hashes=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>"'sha256-"+createHash('sha256').update(m[1]).digest('base64')+"'");
    res.writeHead(200,{...safeHeaders,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; script-src ${hashes.join(' ')||"'none'"}; style-src 'unsafe-inline'; img-src data: 'self'; font-src data: 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'`});res.end(req.method==='HEAD'?'':html);return;
   }
   if(form||url.pathname.startsWith('/api/v2/testing/'))return reply(res,404,'This page or action is not available.');
   if(req.method==='GET'&&url.pathname==='/'){res.writeHead(302,{...safeHeaders,Location:'/v2/'});res.end();return;}
   if(req.method==='GET'&&url.pathname==='/favicon.ico'){res.writeHead(204,safeHeaders);res.end();return;}
   if(await v2.handler(req,res,url))return;
   reply(res,404,'This page or action is not available.');
  }catch(error){
   const rejected=stage==='access'&&((error instanceof joseErrors.JOSEError&&!['ERR_JWKS_TIMEOUT','ERR_JWKS_INVALID'].includes(error.code))||error.message==='Access token required.'||error.message==='Tester not authorized.');
   const status=rejected?403:503;
   console.warn(JSON.stringify({event:'pond_request_failure',stage,status,code:error instanceof joseErrors.JOSEError?error.code:'UNAVAILABLE'}));
   if(!res.headersSent){if(status===503)res.setHeader('Retry-After','10');reply(res,status,status===403?'Access denied.':'The service is temporarily unavailable. Please try again.');}else res.end();
  }
 };
 const server=existingServer??createServer();server.removeAllListeners('request');server.on('request',handle);
 if(!server.listening)await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'0.0.0.0',resolve);});
 const timer=setInterval(()=>v2.purge(),3600000);timer.unref();
 return {server,async close(){ready=false;clearInterval(timer);await new Promise(resolve=>server.close(resolve));await v2.close();await store.close();}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{
  const env=process.env;const testers=(env.POND_TESTER_EMAILS??'').split(',').map(x=>x.trim()).filter(Boolean);
  if(!env.DATABASE_URL||!env.ACCESS_ISSUER||!env.ACCESS_AUDIENCE||!testers.length)throw Error('Missing configuration');
  const ssl=hostedDatabaseTls(env);
  const verify=accessVerifier({issuer:env.ACCESS_ISSUER,audience:env.ACCESS_AUDIENCE,emails:testers});
  const port=Number(env.PORT);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid port');
  // The provider rolls containers before stopping the old writer. Accept TCP with a
  // data-free 503 while waiting for its lock, then rebuild from PostgreSQL.
  const server=createServer((req,res)=>{const live=req.method==='GET'&&req.url==='/livez';res.writeHead(live?200:503,{...safeHeaders,'Retry-After':'5','Content-Type':'text/plain'});res.end(live?'alive':'Test site starting. Please retry shortly.');});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'0.0.0.0',resolve);});
  let store;const deadline=Date.now()+120000;
  while(!store){try{store=await openPostgres({connectionString:env.DATABASE_URL,ssl,onFailure:()=>process.exit(1)});}catch(error){if(error.code!=='POND_WRITER_BUSY'||Date.now()>deadline)throw error;await new Promise(resolve=>setTimeout(resolve,1000));}}
  const app=await createHosted({store,testers,verify,server});
  console.log('Private Frog Pond Boys test server ready. Mail simulated.');
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
 }catch{console.error('Hosted startup failed. Check configuration and database availability.');process.exit(1);}
}
