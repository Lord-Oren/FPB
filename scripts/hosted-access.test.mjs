import test from 'node:test';import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT,createLocalJWKSet,exportJWK} from 'jose';
import {accessVerifier} from '../editor/backend/access.mjs';
test('Access: signature, issuer, audience, expiry and tester allowlist',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256');const jwk={...await exportJWK(publicKey),kid:'test'};
 const verify=accessVerifier({issuer:'https://fpb-test.cloudflareaccess.com',audience:'fpb-audience',emails:['alice@example.test'],keySet:createLocalJWKSet({keys:[jwk]})});
 const sign=(claims={})=>new SignJWT({email:'alice@example.test',...claims}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuedAt().setSubject('alice').setIssuer('https://fpb-test.cloudflareaccess.com').setAudience('fpb-audience').setExpirationTime('1h').sign(privateKey);
 assert.equal((await verify(await sign())).email,'alice@example.test');await assert.rejects(()=>verify(undefined));await assert.rejects(()=>verify(awaitable));
 await assert.rejects(()=>sign({email:'mallory@example.test'}).then(verify));
 const expired=await new SignJWT({email:'alice@example.test'}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuedAt().setSubject('alice').setIssuer('https://fpb-test.cloudflareaccess.com').setAudience('fpb-audience').setExpirationTime(1).sign(privateKey);await assert.rejects(()=>verify(expired));
 for(const [issuer,audience]of [['https://evil.example','fpb-audience'],['https://fpb-test.cloudflareaccess.com','other']]){
  const jwt=await new SignJWT({email:'alice@example.test'}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuedAt().setSubject('alice').setIssuer(issuer).setAudience(audience).setExpirationTime('1h').sign(privateKey);await assert.rejects(()=>verify(jwt));
 }
 const good=await sign();await assert.rejects(()=>verify(good.slice(0,-8)+'abcdefgh'));
});
const awaitable='forged-token';
