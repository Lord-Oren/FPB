// Publication diagnostics for editable team rows; unfinished drafts stay editable.
import {check} from './model.mjs';
export function validateTeamPublication(about,media=[]) {
 for(const field of ['team','extendedTeam']){
  const rows=about?.[field]??[];
  check(Array.isArray(rows)&&rows.length<=24,'Use up to 24 people in each team.',422,field);
  for(const [index,person]of rows.entries()){
   const label=`Person ${index+1} in ${field==='team'?'the team':'the extended team'}`;
   check(person&&typeof person==='object'&&!Array.isArray(person),`${label}: enter a name and a role.`,422,field);
   for(const key of ['name','role'])check(typeof person[key]==='string'&&person[key].trim().length>0&&person[key].length<=90,`${label}: enter a ${key} (up to 90 characters) before publishing.`,422,field);
   if(person.photo!=null){
    const photo=person.photo;
    check(photo&&Object.getPrototypeOf(photo)===Object.prototype&&Object.keys(photo).every(k=>['mediaId','alt'].includes(k))&&media.some(m=>m.id===photo.mediaId),`${label}: choose an uploaded photo or remove it.`,422,field);
    check(typeof photo.alt==='string'&&photo.alt.trim().length>0&&photo.alt.length<=200,`${label}: add a short photo description (up to 200 characters).`,422,field);
   }
  }
 }
}
