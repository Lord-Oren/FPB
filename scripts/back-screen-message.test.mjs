import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';
import {defaultStructure,prepareStructure,screenMessageLength} from '../src/data/structure.js';
import {createEditor} from '../editor/server.mjs';
const withMessage=(message,id='recents')=>{const tree=defaultStructure();tree.nodes.find(n=>n.id===id).message=message;return tree;};
test('screen messages: visible characters, plain line, zone and legacy contract',()=>{
 const legacy=defaultStructure();assert.deepEqual(prepareStructure(legacy),legacy);
 for(const message of ['', ' '.repeat(10), 'x'.repeat(14), '🐸'.repeat(14), '👨‍👩‍👧'.repeat(14), 'e\u0301'.repeat(14), '<b> & hello', '  Hi pond!  ']){
  const value=prepareStructure(withMessage(message)).nodes.find(n=>n.id==='recents').message??'';assert.equal(value,message.trim());
 }
 assert.equal(screenMessageLength('👨‍👩‍👧 é'),3);
 for(const message of ['x'.repeat(15),'🐸'.repeat(15),'x'.repeat(60),'a\nb','\ntrim','a\tb','a\u2028b','a\u2029b','a\u202eb','a\u2066b',null,14,{}])assert.throws(()=>prepareStructure(withMessage(message)),e=>e.status===422&&e.diagnostics[0].field==='message');
 assert.throws(()=>prepareStructure(withMessage('hi','about')),/Only lily-pad screens/);
 const tree=withMessage('hi','client-work');tree.nodes.find(n=>n.id==='client-work').zone='screens';assert.throws(()=>prepareStructure(tree),/Only lily-pad screens/,'parent zone is resolved before message validation');
 assert.equal('message' in prepareStructure(withMessage('   ')).nodes.find(n=>n.id==='recents'),false);
});
test('screen messages API: reject without writes, private draft, publish, restore and restart',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'fpb-screen-'));let server,base,token,failBuild=false;const built=[];
 const start=async()=>{server=await createEditor({root,port:0,v2Options:{builder:async(r,f,id,snapshot)=>{if(failBuild)throw Error('test build failure');built.push(snapshot);}}});base=`http://127.0.0.1:${server.address().port}`;token=(await(await fetch(base+'/api/v2/session')).json()).token;};
 const stop=async()=>new Promise(resolve=>server.close(resolve));
 const req=(method,route,body)=>fetch(base+'/api/v2'+route,{method,headers:{'X-Editor-Token':token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const ok=async(method,route,body)=>{const res=await req(method,route,body),value=await res.json();assert.equal(res.status,200,JSON.stringify(value));return value;};
 try{await mkdir(path.join(root,'src/data'),{recursive:true});for(const name of ['site-content.json','case-studies-public.json'])await writeFile(path.join(root,'src/data',name),await readFile(new URL('../src/data/'+name,import.meta.url)));await start();
  let tree=await ok('GET','/structure');await ok('POST','/structure/publish',{revision:tree.revision});const legacy=(await ok('GET','/publishes'))[0].id;
  const disk=path.join(root,'.local-editor/v2/state.json');const before=await readFile(disk,'utf8');
  for(const message of ['x'.repeat(15),'bad\nline',null]){const candidate=structuredClone(tree.fields);candidate.nodes.find(n=>n.id==='recents').message=message;const res=await req('PUT','/structure',{revision:tree.revision,structure:candidate});assert.equal(res.status,422);assert.equal((await res.json()).diagnostics[0].field,'message');assert.equal(await readFile(disk,'utf8'),before);}
  tree.fields.nodes.find(n=>n.id==='recents').message='👨‍👩‍👧'.repeat(14);tree=await ok('PUT','/structure',{revision:tree.revision,structure:tree.fields});assert.equal(tree.live.nodes.find(n=>n.id==='recents').message,undefined);
  const publicFile=path.join(root,'src/data/site-content.json');assert.equal(JSON.parse(await readFile(publicFile)).structure.nodes.find(n=>n.id==='recents').message,undefined);
  failBuild=true;assert.equal((await req('POST','/structure/publish',{revision:tree.revision})).status,422);assert.equal((await ok('GET','/structure')).live.nodes.find(n=>n.id==='recents').message,undefined);failBuild=false;
  await ok('POST','/structure/publish',{revision:tree.revision});const live=(await ok('GET','/publishes'))[0].id;assert.equal(built.at(-1).site.structure.nodes.find(n=>n.id==='recents').message,'👨‍👩‍👧'.repeat(14));
  tree=await ok('GET','/structure');tree.fields.nodes.find(n=>n.id==='recents').message='Private';tree=await ok('PUT','/structure',{revision:tree.revision,structure:tree.fields});
  assert.equal((await req('PUT','/structure',{revision:tree.revision-1,structure:tree.fields})).status,409);
  await ok('POST','/publishes/'+legacy+'/restore',{});tree=await ok('GET','/structure');assert.equal(tree.live.nodes.find(n=>n.id==='recents').message,undefined);assert.equal(tree.fields.nodes.find(n=>n.id==='recents').message,'Private');
  await ok('POST','/publishes/'+live+'/restore',{});await stop();await start();tree=await ok('GET','/structure');assert.equal(tree.live.nodes.find(n=>n.id==='recents').message,'👨‍👩‍👧'.repeat(14));assert.equal(tree.fields.nodes.find(n=>n.id==='recents').message,'Private');
 }finally{if(server?.listening)await stop();await rm(root,{recursive:true,force:true});}
});
