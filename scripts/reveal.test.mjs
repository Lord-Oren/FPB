import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const script=await readFile(new URL('../src/scripts/reveal.js',import.meta.url),'utf8');
function run({reduced=false,supported=true}={}){
 const observed=[],removed=[],classes=new Set();let callback;
 const item={classList:{add:value=>classes.add(value)}};
 class Observer{constructor(fn){callback=fn;}observe(el){observed.push(el);}unobserve(el){removed.push(el);}}
 const root=new Set();const window={matchMedia:()=>({matches:reduced}),...(supported?{IntersectionObserver:Observer}:{})};
 vm.runInNewContext(script,{window,IntersectionObserver:Observer,document:{querySelectorAll:()=>[item],documentElement:{classList:{add:value=>root.add(value)}}}});
 return {observed,removed,classes,root,item,enter:()=>callback([{isIntersecting:true,target:item}])};
}
test('reveal: reduced motion keeps content visible without observing',()=>{const s=run({reduced:true});assert.equal(s.root.size,0);assert.equal(s.observed.length,0);});
test('reveal: unsupported observers keep content visible',()=>{const s=run({supported:false});assert.equal(s.root.size,0);});
test('reveal: visible items are shown once and unobserved',()=>{const s=run();assert(s.root.has('reveal-ready'));assert.equal(s.observed.length,1);s.enter();assert(s.classes.has('is-visible'));assert.deepEqual(s.removed,[s.item]);});
