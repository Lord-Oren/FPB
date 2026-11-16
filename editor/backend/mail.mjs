// Plain-text transport. Constructing an adapter never sends mail. Provider errors never expose response bodies.
import {email,check} from './model.mjs';
export function mailTransport(env={},fetcher=fetch) {
 if(env.POND_MAIL_MODE!=='resend')return {mode:'simulated',notifications:[],replyDomain:'reply.invalid'};
 const from=email(env.POND_MAIL_FROM),notifications=(env.POND_NOTIFY_EMAILS||'').split(',').filter(Boolean).map(email);
 const replyDomain=env.POND_REPLY_DOMAIN;
 check(env.RESEND_API_KEY&&/^[a-z0-9.-]+\.[a-z]{2,}$/.test(replyDomain||''),'Mail configuration is incomplete.',503);
 return {mode:'resend',from,notifications,replyDomain,async send(message){
  const response=await fetcher('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':message.id},body:JSON.stringify({from:'Frog Pond Boys <'+from+'>',to:message.to,subject:message.subject,text:message.text,reply_to:message.replyTo})});
  if(!response.ok)throw Object.assign(Error('Email provider unavailable.'),{code:'MAIL_PROVIDER',status:response.status});
  const value=await response.json();check(typeof value.id==='string','Email provider returned no receipt.',503);return value.id;
 }};
}
export function queueEmail(state,transport,{id,conversationId,kind,to,subject,text,replyTo,at}) {
 const status=transport.mode==='resend'?'queued':'simulated';
 const entry={id,conversationId,kind,to,subject,text,replyTo,at,status,attempts:0};state.outbox.push(entry);return entry;
}
export async function deliverPending(state,transport,now,save) {
 if(transport.mode!=='resend')return;
 for(const entry of state.outbox.filter(m=>['queued','failed'].includes(m.status)&&(!m.nextAttemptAt||m.nextAttemptAt<=now)).slice(0,5)){
  // Provider idempotency lasts 24h; never retry an uncertain old delivery with an expired key.
  if(Date.parse(now)-Date.parse(entry.at)>23*3600000||entry.attempts>=5){entry.status='review_required';await save(state);continue;}
  entry.attempts++;entry.nextAttemptAt=new Date(Date.parse(now)+Math.min(3600,60*2**entry.attempts)*1000).toISOString();await save(state);
  try{entry.providerId=await transport.send(entry);entry.status='sent';}catch{entry.status='failed';}
  const message=state.conversations.find(t=>t.id===entry.conversationId)?.messages.find(m=>m.mailId===entry.id);
  if(message)message.status=entry.status;
  await save(state);
 }
}
