import test from 'node:test';import assert from 'node:assert/strict';
import {validateAttachmentEnvelope,validatePortfolioUrl,JOIN_MAX_BYTES,FILE_TOO_LARGE_MESSAGE} from '../editor/backend/attachment-policy.mjs';
test('oversize Join file gives the exact structured limit error',()=>{
 assert.throws(()=>validateAttachmentEnvelope({name:'cv.pdf',base64:Buffer.alloc(JOIN_MAX_BYTES+1).toString('base64')}),e=>e.code==='file_too_large'&&e.status===413&&e.message===FILE_TOO_LARGE_MESSAGE);
});
test('intake never treats a signature as a safety verdict and rejects mismatched/Word files',()=>{
 const data=Buffer.from('%PDF-1.7\nnot yet parsed').toString('base64');
 assert.equal(validateAttachmentEnvelope({name:'cv.pdf',base64:data}).state,'quarantine');
 assert.throws(()=>validateAttachmentEnvelope({name:'cv.png',base64:data}),/matching/);
 assert.throws(()=>validateAttachmentEnvelope({name:'cv.docx',base64:data}),/Word/);
 assert.throws(()=>validateAttachmentEnvelope({name:'../cv.pdf',base64:data}),/filename/);
 assert.throws(()=>validatePortfolioUrl('javascript:alert(1)'),/HTTPS/);
 assert.throws(()=>validatePortfolioUrl('https://user:pass@portfolio.test'),/HTTPS/);
 assert.equal(validatePortfolioUrl('https://portfolio.test/work'),'https://portfolio.test/work');
});
