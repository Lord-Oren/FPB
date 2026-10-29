import test from 'node:test';import assert from 'node:assert/strict';import {proxy,keepAwake} from '../hosting/cloudflare-worker.mjs';
const env={RENDER_ORIGIN_HOST:'fpb-fixture.onrender.com'};
test('free edge router preserves host, body, token and relative redirects without caching',async()=>{
 let captured;const response=await proxy(new Request('https://frogpondboys.com/api/v2/forms/contact?x=1',{method:'POST',headers:{'Cf-Access-Jwt-Assertion':'signed-fixture','X-Pond-Public-Host':'evil.example',Origin:'https://frogpondboys.com'},body:'fictional message'}),env,async request=>{captured=request;return new Response('saved',{status:200,headers:{'Cache-Control':'public'}});});
 assert.equal(captured.url,'https://fpb-fixture.onrender.com/api/v2/forms/contact?x=1');assert.equal(captured.headers.get('X-Pond-Public-Host'),'frogpondboys.com');assert.equal(captured.headers.get('Origin'),'https://frogpondboys.com');assert.equal(captured.headers.get('Cf-Access-Jwt-Assertion'),'signed-fixture');assert.equal(await captured.text(),'fictional message');assert.equal(captured.redirect,'manual');assert.equal(response.headers.get('cache-control'),'no-store');
});
test('free edge router rejects unknown hosts, missing session and unconfigured origin',async()=>{
 const never=()=>{throw Error('Must not forward');};
 assert.equal((await proxy(new Request('https://evil.example/'),env,never)).status,403);
 assert.equal((await proxy(new Request('https://frogpondboys.com/'),env,never)).status,403);
 assert.equal((await proxy(new Request('https://frogpondboys.com/',{headers:{'Cf-Access-Jwt-Assertion':'fixture'}}),{},never)).status,503);
});

test('wake page only replaces temporary errors for HTML navigation',async()=>{
 const req=(method='GET',path='/')=>new Request('https://frogpondboys.com'+path,{method,headers:{'Cf-Access-Jwt-Assertion':'signed-fixture',Accept:'text/html'}});
 const warm=await proxy(req(),env,async()=>new Response('starting',{status:503}));assert.equal(warm.status,503);assert.match(await warm.text(),/The pond is waking up/);assert.equal(warm.headers.get('Cache-Control'),'no-store');
 const denied=await proxy(req(),env,async()=>new Response('denied',{status:403}));assert.equal(await denied.text(),'denied');
 const api=await proxy(req('POST','/api/v2/forms/contact'),env,async()=>new Response('starting',{status:503}));assert.equal(await api.text(),'starting');
 const offline=await proxy(req(),env,async()=>{throw Error('network')});assert.equal(offline.status,503);
});

test('scheduled warm-up is bounded, credential-free, uses liveness only and refuses redirects',async()=>{
 let captured,calls=0;const settings={...env,KEEP_AWAKE_UNTIL:'2026-11-02T00:00:00Z'};
 const forward=async request=>{calls++;captured=request;return new Response('alive')};
 assert.equal(await keepAwake(settings,forward,Date.parse('2026-10-26T00:00:00Z')),'awake');
 assert.equal(captured.url,'https://fpb-fixture.onrender.com/livez');assert.equal(captured.redirect,'manual');assert.equal([...captured.headers].length,0);
 assert.equal(await keepAwake(settings,forward,Date.parse(settings.KEEP_AWAKE_UNTIL)),'disabled');
 assert.equal(await keepAwake(env,forward),'disabled');assert.equal(calls,1);
 await assert.rejects(()=>keepAwake({...settings,RENDER_ORIGIN_HOST:'evil.example'},forward,0));
 await assert.rejects(()=>keepAwake(settings,async()=>new Response(null,{status:302}),0));
});
