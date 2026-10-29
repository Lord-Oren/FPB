import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const script=await readFile(new URL('../src/scripts/local-forms.js',import.meta.url),'utf8');
for(const hosted of [true,false])test(`form transport preserves Access session only for hosted same-origin requests (${hosted})`,async()=>{
 let submit,request,reset=false;const status={textContent:''},button={disabled:false};
 const form={dataset:{local:'true',hosted:String(hosted)},action:hosted?'https://frogpondboys.com/api/v2/forms/contact':'http://127.0.0.1:4323/api/v2/forms/contact',querySelector:s=>s==='[data-form-status]'?status:s==='[type="submit"]'?button:null,addEventListener:(name,handler)=>{submit=handler;},reset:()=>{reset=true;}};
 vm.runInNewContext(script,{document:{querySelectorAll:()=>[form]},FormData:class{},fetch:async(url,options)=>{request={url,...options};return {ok:true,json:async()=>({message:'saved'})};}});
 await submit({defaultPrevented:false,preventDefault(){}});
 assert.equal(request.credentials,hosted?'same-origin':'omit');assert.equal(request.method,'POST');assert.equal(reset,true);assert.match(status.textContent,/Saved in .*Pond Desk/);assert.equal(button.disabled,false);
});
