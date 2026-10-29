// Verify Access signatures against a fixed trusted issuer, audience and explicit tester allowlist.
import {createRemoteJWKSet,jwtVerify} from 'jose';
export function accessVerifier({issuer,audience,emails,keySet}) {
 if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)||!audience||!emails.length)throw Error('Access issuer, audience and testers are required.');
 const allowed=new Set(emails.map(e=>e.trim().toLowerCase()));
 const keys=keySet??createRemoteJWKSet(new URL(issuer+'/cdn-cgi/access/certs'),{timeoutDuration:5000,cooldownDuration:30000,cacheMaxAge:300000});
 return async token=>{
  if(typeof token!=='string'||token.length>16384)throw Error('Access token required.');
  const {payload}=await jwtVerify(token,keys,{issuer,audience,algorithms:['RS256'],requiredClaims:['exp','iat','sub','email'],clockTolerance:5});
  const email=String(payload.email).toLowerCase();if(!allowed.has(email)||payload.type==='service')throw Error('Tester not authorized.');
  return {email,subject:payload.sub};
 };
}
