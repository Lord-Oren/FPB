// Private inbound replies only. No mailbox is shared, and no message content is logged.
import PostalMime from 'postal-mime';
export async function receiveEmail(message,env,forward=fetch){
 const auth=message.headers.get('Authentication-Results')||'';
 // Cloudflare documents the first Authentication-Results header as its trusted result.
 if(!/^mx\.cloudflare\.net\s*;/i.test(auth)||!/(?:^|;)\s*dmarc=pass(?:[;\s]|$)/i.test(auth)){message.setReject('Sender authentication required.');return;}
 if(!env.POND_INBOUND_SECRET||env.POND_INBOUND_SECRET.length<32||!/^reply-[a-f0-9]{24}$/.test(message.to.split('@')[0])||message.to.split('@')[1]!==env.POND_REPLY_DOMAIN){message.setReject('Unknown conversation.');return;}
 if(message.rawSize>1024*1024){message.setReject('Reply too large. Use the website for attachments.');return;}
 const reader=message.raw.getReader(),chunks=[];let length=0;
 for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>1024*1024){await reader.cancel();message.setReject('Reply too large.');return;}chunks.push(value);}
 const raw=new Uint8Array(length);let offset=0;for(const c of chunks){raw.set(c,offset);offset+=c.length;}
 const parsed=await PostalMime.parse(raw);const from=parsed.from?.address?.toLowerCase();
 if(!from||!parsed.text?.trim()||parsed.text.length>10000||parsed.attachments?.length){message.setReject('Send a plain-text reply without attachments.');return;}
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),x=>x.toString(16).padStart(2,'0')).join('');
 const body=JSON.stringify({eventId:digest,from,to:message.to.toLowerCase(),text:parsed.text.trim()}),stamp=String(Date.now());
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.POND_INBOUND_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(stamp+'.'+body))),x=>x.toString(16).padStart(2,'0')).join('');
 if(!/^[a-z0-9-]+\.onrender\.com$/.test(env.RENDER_ORIGIN_HOST||''))throw Error('Mail destination is not configured.');
 const response=await forward('https://'+env.RENDER_ORIGIN_HOST+'/api/v2/mail/inbound',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json','X-Pond-Public-Host':env.POND_PUBLIC_HOST,'X-Forwarded-Proto':'https','X-Pond-Mail-Time':stamp,'X-Pond-Mail-Signature':signature},body});
 if(!response.ok)throw Error('Pond Desk did not accept this reply.');
}
export default {email(message,env){return receiveEmail(message,env);}};
