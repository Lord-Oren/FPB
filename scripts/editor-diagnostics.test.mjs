import test from 'node:test';
import assert from 'node:assert/strict';
import { contentDiagnostics,diagnosticMessage,diagnosticTarget } from '../editor/diagnostics.js';

test('structured diagnostics: all errors, distinct codes and nested paths',()=>{
 const issues=contentDiagnostics({title:'\u202e'+'a'.repeat(91),summary:'',context:'',work:'',gallery:[{assetId:'missing',alt:''}]},'one');
 assert(issues.some(i=>i.field==='title'&&i.code==='too_long'&&i.maximum===90));
 assert(issues.some(i=>i.field==='title'&&i.code==='forbidden_character'));
 assert(issues.filter(i=>i.code==='required').length>=4);
 const gallery=issues.find(i=>i.field==='gallery.alt');assert.equal(gallery.index,1);assert.equal(diagnosticTarget(gallery),'gallery-1-alt');
 assert.match(diagnosticMessage(issues.find(i=>i.code==='forbidden_character')),/not allowed/);
});
test('incomplete drafts can be saved; forbidden characters cannot',()=>{
 assert.deepEqual(contentDiagnostics({title:'',gallery:[]},'one',{complete:false}),[]);
 assert.equal(contentDiagnostics({title:'\u2066',gallery:[]},'one',{complete:false})[0].code,'forbidden_character');
});
