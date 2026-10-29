import test from 'node:test';
import assert from 'node:assert/strict';
import {historyLabel,conversationView} from '../editor/backend/messages.mjs';
test('old system labels display in English without changing saved or user-authored text',()=>{
 assert.equal(historyLabel('Images pixel et liens de démonstration actualisés'),'Pixel images and sample links updated');
 assert.equal(historyLabel('Page mise à jour'),'Page updated');
 assert.equal(historyLabel('Customer custom label'),'Customer custom label');
 const text='[Simulation — aucun e-mail envoyé]\nMerci pour votre message.';
 const original={messages:[{from:'us',simulation:true,text},{from:'them',text},{from:'us',simulation:false,text}]};
 const view=conversationView(original);
 assert.equal(view.messages[0].text,'[Simulation - no email sent]\nMerci pour votre message.');
 assert.equal(view.messages[1].text,text);assert.equal(view.messages[2].text,text);assert.equal(original.messages[0].text,text);
});
