import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {check} from './model.mjs';
export const privateRateKey=value=>createHash('sha256').update(String(value)).digest('hex');
export function sameSecret(a,b){if(typeof a!=='string'||typeof b!=='string'||b.length<32)return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export function formSecurity(env={},fetcher=fetch){
 const enabled=env.POND_FORMS_ENABLED==='true';
 if(!enabled)return {enabled:false};
 check(env.TURNSTILE_SECRET_KEY&&env.POND_FORM_PROXY_SECRET?.length>=32&&env.POND_MAIL_MODE==='resend','Public forms require mail, Turnstile and the proxy secret.',503);
 return {enabled:true,proxySecret:env.POND_FORM_PROXY_SECRET,async verify(token,hostname,action){
  check(typeof token==='string'&&token.length>0&&token.length<=2048,'Please complete the verification and try again.',422);
  const response=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:token})});
  check(response.ok,'Verification is temporarily unavailable.',503);const result=await response.json();
  check(result.success===true&&result.hostname===hostname&&result.action===action,'Verification failed. Reload the page and try again.',422);
 }};
}
export function verifyInbound(raw,headers,secret,now=Date.now()) {
 check(secret?.length>=32,'Incoming mail is not configured.',503);
 const stamp=headers['x-pond-mail-time'];const signature=headers['x-pond-mail-signature'];
 check(/^\d{13}$/.test(stamp||'')&&Math.abs(now-Number(stamp))<300000,'Incoming message authorization failed.',403);
 const expected=createHmac('sha256',secret).update(stamp+'.').update(raw).digest('hex');
 check(sameSecret(signature,expected),'Incoming message authorization failed.',403);
}
