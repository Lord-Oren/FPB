// Exercise the actual screen callbacks: publication must not authorize old fields with a newer draft revision.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../editor/v2/app.js',import.meta.url),'utf8');
const screen=app.slice(app.indexOf('async function openWording()'),app.indexOf('// ---------- Space: applications'));
async function fixture(concurrent,start={}){
 let revision=1,fields={'home.title':''},live={...start},published=false;
 const nodes=[],messages=[],statuses=[];
 const context={WORDING:[['Home',[['home.title','Title']]]],state:{dirty:false},PLAN:{save:{},publish:{}},main:()=>{},topBar:x=>x,viewOnSite:()=>null,writer:work=>work,track:(route,body)=>context.call('POST',route,body),screenMark:()=>()=>true,showProblems:()=>{},serverProblems:()=>[],toast:message=>messages.push(message),
  h:(tag,attributes,...children)=>{const node={tag,...attributes,children};nodes.push(node);return node;},
  call:async(method,route,body)=>{
   if(method==='GET')return {revision,fields:{...fields},live:{...live},defaults:{'home.title':'Original'},limits:{'home.title':240}};
   if(method==='PUT'){
    if(body.revision!==revision){statuses.push(409);throw Object.assign(Error('Conflict'),{status:409});}
    fields={...body.fields};statuses.push(200);return {revision:++revision};
   }
   assert.equal(method,'POST');assert.equal(route,'/pages/wording/publish');live={...fields};published=true;
   // A second member saves immediately after publication, before the first tab can refresh.
   if(concurrent){fields={'home.title':'Other member draft'};revision++;}return {message:'Published'};
  }};
 vm.createContext(context);vm.runInContext(screen+'\nglobalThis.openScreen=openWording;',context);await context.openScreen();
 const input=nodes.find(n=>n.name==='home.title'),button=label=>nodes.find(n=>n.tag==='button'&&n.children.includes(label));
 const hint=nodes.find(n=>n.id==='w-home-title-hint');
 return {input,hint,publish:()=>button('Publish to the site').onclick(),save:()=>button('Save without publishing').onclick(),read:()=>({revision,fields,live,published,statuses,messages})};
}
test('wording screen: publish then concurrent save preserves the other member draft',async()=>{
 const f=await fixture(true);f.input.value='First member';await f.publish();await f.save();const result=f.read();
 assert.equal(result.published,true);assert.equal(result.live['home.title'],'First member');assert.equal(result.fields['home.title'],'Other member draft');assert.equal(result.statuses.at(-1),409);assert.equal(f.input.value,'First member');assert.ok(result.messages.some(x=>x.includes('Your changes are still here')));
});
test('wording screen: subsequent saves still succeed when nobody else edits',async()=>{
 const f=await fixture(false);f.input.value='First wording';await f.publish();f.input.value='Next draft';await f.save();const result=f.read();
 assert.equal(result.statuses.at(-1),200);assert.equal(result.fields['home.title'],'Next draft');assert.equal(result.live['home.title'],'First wording');
});
test('wording screen: "On the site now" follows a confirmed publication without adopting another draft',async()=>{
 const f=await fixture(false,{'home.title':'Old live'});
 assert.match(f.hint.text,/On the site now: Old live/);
 f.input.value='New title';await f.publish();
 assert.equal(f.hint.textContent,'Original: Original');
 const g=await fixture(true,{'home.title':'Old live'});g.input.value='Mine';await g.publish();
 assert.equal(g.hint.textContent,'Original: Original','live is now this tab text');
 await g.save();assert.equal(g.read().statuses.at(-1),409,'the other member draft is still protected');
});
