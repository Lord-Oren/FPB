import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultStructure,prepareStructure} from '../src/data/structure.js';
const page=parentId=>({id:'fourth',title:'Fourth',kind:'page',zone:'menus',parentId,slug:'fourth',visible:true,newTab:false,text:'',href:''});
test('frog menu can be renamed and receive a fourth subsection',()=>{
 const tree=defaultStructure(); const frog=tree.nodes.find(n=>n.id==='advertising'); const original=tree.nodes.filter(n=>n.parentId===frog.id).map(n=>n.id);
 frog.title='Our studio'; tree.nodes.push(page(frog.id));
 const saved=prepareStructure(tree);
 assert.equal(saved.nodes.find(n=>n.id===frog.id).title,'Our studio');
 assert.deepEqual(saved.nodes.filter(n=>n.parentId===frog.id).map(n=>n.id),[...original,'fourth']);
});
test('Gram can be renamed without changing its address or tab behavior',()=>{
 const tree=defaultStructure();const gram=tree.nodes.find(n=>n.id==='gram');const slug=gram.slug;gram.title='Studio moments';
 const saved=prepareStructure(tree).nodes.find(n=>n.id==='gram');assert.equal(saved.title,'Studio moments');assert.equal(saved.slug,slug);assert.equal(saved.newTab,true);
});
test('televisions and ordinary pages reject subsections',()=>{
 for(const parentId of ['gram','croak','about']){const tree=defaultStructure();tree.nodes.push(page(parentId));assert.throws(()=>prepareStructure(tree),/Only frog menus/);}
});
test('a menu cannot be moved onto a television zone',()=>{
 const tree=defaultStructure();tree.nodes.find(n=>n.id==='advertising').zone='screens';assert.throws(()=>prepareStructure(tree),/Menus belong|Only frog menus/);
});
