// Free edge routing only. Access runs before this Worker; the origin also
// verifies the JWT cryptographically. No tokens or form contents are logged.
import {deploymentConfig} from './config.mjs';
function waking(){return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Frog Pond Boys - starting</title><style>body{margin:0;background:#05353a;color:#f3f7f6;font:18px/1.6 system-ui;display:grid;min-height:100vh;place-items:center}main{max-width:34rem;padding:2rem}a{color:#ffdb76}h1{line-height:1.2}</style><main><h1>The pond is waking up.</h1><p>This site uses free hosting. Starting may take about a minute.</p><p>Your saved content is kept. Please wait a moment, then reload this page.</p><p><a href="">Reload this page</a></p></main></html>`,{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Retry-After':'10','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'}});}
export async function proxy(request,env,forward=fetch){
 const source=new URL(request.url);
 const {hosts,www,publicSite}=deploymentConfig(env);
 const allowed=new Set([...Object.values(hosts),www]);
 const publicRequest=publicSite&&(source.hostname===hosts.a||source.hostname===www);
 if(publicRequest&&( !['GET','HEAD'].includes(request.method)||source.pathname.startsWith('/api/')))return new Response('Not found',{status:404});
 if(publicSite&&source.hostname===hosts.b)return new Response('Not found',{status:404});
 if(source.protocol!=='https:'||!allowed.has(source.hostname))return new Response('Forbidden',{status:403});
 if(!publicRequest&&!request.headers.get('Cf-Access-Jwt-Assertion'))return new Response('Access session required',{status:403});
 if(!/^[a-z0-9-]+\.onrender\.com$/.test(env.RENDER_ORIGIN_HOST??''))return new Response('Not configured',{status:503});
 const target=new URL(source);target.hostname=env.RENDER_ORIGIN_HOST;target.port='';
 const upstream=new Request(target,request);upstream.headers.delete('Host');
 upstream.headers.set('X-Pond-Public-Host',source.hostname);
 upstream.headers.set('X-Forwarded-Proto','https');
 // Preserve relative redirects and streaming bodies, never cache private data.
 const navigation=request.method==='GET'&&!source.pathname.startsWith('/api/')&&(request.headers.get('Accept')??'').includes('text/html');
 let result;try{result=await forward(new Request(upstream,{redirect:'manual'}));}catch(error){if(navigation)return waking();throw error;}
 if(navigation&&[502,503,504].includes(result.status)){await result.body?.cancel();return waking();}
 const response=new Response(result.body,result);response.headers.set('Cache-Control','no-store');return response;
}
// Only the existing public, data-free liveness route is used. No credentials,
// database queries or customer data are involved. A finite deadline limits the test.
export async function keepAwake(env,forward=fetch,now=Date.now()){
 const until=Date.parse(env.KEEP_AWAKE_UNTIL??'');
 if(!Number.isFinite(until)||now>=until)return 'disabled';
 if(!/^[a-z0-9-]+\.onrender\.com$/.test(env.RENDER_ORIGIN_HOST??''))throw Error('Invalid test origin');
 const response=await forward(new Request('https://'+env.RENDER_ORIGIN_HOST+'/livez',{redirect:'manual',signal:AbortSignal.timeout(15000)}));
 const ok=response.status===200;await response.body?.cancel();
 if(!ok)throw Error('Test origin unavailable');return 'awake';
}
export default {fetch(request,env){return proxy(request,env);},scheduled(controller,env,ctx){ctx.waitUntil(keepAwake(env));}};
