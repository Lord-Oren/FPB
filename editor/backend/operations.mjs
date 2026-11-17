// Ephemeral, session-bound progress. No timer advances a step or fabricates success.
import {randomUUID} from 'node:crypto';
export function operationPlan(method,route,variants=['a','b']){
 if(method!=='POST')return null;
 if(route==='/files')return [['format','Checking the format'],['processing','Processing the file'],['saving','Saving the file']];
 if(!/^(?:\/structure\/publish|\/items\/[^/]+\/publish|\/pages\/[^/]+\/publish|\/publishes\/[^/]+\/restore)$/.test(route))return null;
 return [['content','Checking the content'],...variants.flatMap(v=>[[`build-${v}`,`Building version ${v.toUpperCase()}`],[`check-${v}`,`Checking version ${v.toUpperCase()}`]]),['install','Publishing and saving the history']];
}
export function createOperations({now=Date.now,limit=32,ttl=600000}={}){
 const jobs=new Map();
 const sweep=()=>{for(const [id,job]of jobs)if(job.ended!==null&&now()-job.ended>=ttl)jobs.delete(id);};
 return {
  create(owner,plan){
   sweep();if(jobs.size>=limit)throw Object.assign(Error('Too many operations are being tracked. Try again shortly.'),{status:429});
   const job={id:randomUUID(),owner,state:'running',steps:plan.map(([id,label])=>({id,label,state:'waiting'})),current:-1,ended:null,message:'Waiting for the previous operation.'};jobs.set(job.id,job);
   const stage=(id,counts)=>{
    if(job.state!=='running')return;const index=job.steps.findIndex(s=>s.id===id);if(index<0||index<job.current)return;
    for(let i=0;i<index;i++)job.steps[i].state='done';job.current=index;const step=job.steps[index];step.state='running';job.message=step.label;
    if(counts&&Number.isInteger(counts.done)&&Number.isInteger(counts.total)&&counts.total>0&&counts.done>=0&&counts.done<=counts.total){step.done=counts.done;step.total=counts.total;}
   };
   return {id:job.id,stage,
    succeed(result){if(job.state!=='running')return;for(const s of job.steps)s.state='done';job.state='done';job.result=structuredClone(result);job.message=result?.message||'Done';job.ended=now();},
    fail(error){if(job.state!=='running')return;if(job.current<0)stage(job.steps[0].id);job.steps[job.current].state='failed';job.state='failed';job.ended=now();const message=error.status?error.message:'The operation could not finish. Check the site history before trying again.';job.message=message;job.error={step:job.steps[job.current].id,status:error.status||500,message,...(error.code?{code:error.code}:{}),...(error.diagnostics?{diagnostics:structuredClone(error.diagnostics)}:{})};}
   };
  },
  get(id,owner){sweep();const job=jobs.get(id);if(!job||job.owner!==owner)return null;const {owner:privateOwner,ended,current,...view}=job;return structuredClone(view);}
 };
}
