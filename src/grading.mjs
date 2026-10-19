export const normalize = s => String(s).normalize('NFC').toLocaleLowerCase('it').replace(/[’‘]/g,"'").replace(/[.,!?;:]/g,'').replace(/\s+/g,' ').trim();
const exact = s => String(s).normalize('NFC').replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ').trim();
export function review(task,response) {
 const value=String(response||'').trim();
 if(!value || value.length>4000) throw Error('Enter an answer of up to 4,000 characters.');
 if(task.answers?.length) {
  const norm=task.match==='exact'?exact:task.match==='syllables'?s=>normalize(s).replace(/\s*-\s*/g,'-'):normalize;
  const correct=task.answers.some(a=>norm(a)===norm(value));
  return {correct,status:correct?'correct':'repair',feedback:correct?'That works for this situation.':task.explanation,model:task.model||task.answers[0],checks:[],method:'answer-key'};
 }
 // A bounded writing coach: these findings are suggestions, never an overall proficiency score.
 const checks=[];
 const rules=[
  [/\bio\s+ha\b/i,'With io, use ho: Io ho un libro.'],
  [/\bio\s+(?:è|sei)\b/i,'With io, use sono: Io sono qui.'],
  [/\btu\s+ho\b/i,'With tu, use hai: Tu hai un libro.'],
  [/\b(?:lei|lui)\s+ho\b/i,'With lui or lei, use ha.'],
  [/\bsono\s+\d+\s+anni\b/i,'Use avere for age: Ho venti anni.'],
  [/\bsono\s+(?:fame|sete)\b/i,'Use avere for hunger and thirst: Ho fame. Ho sete.'],
  [/\b(?:io\s+)?sono\s+andato\s+ieri\b/i,'Sono andato ieri is valid for a masculine speaker; sono andata for a feminine speaker.'],
  [/\bqual['’]è\b/i,'Write qual è, with a space and no apostrophe.'],
  [/\bpò\b/i,'For a little, write po’ with an apostrophe.'],
  [/\b(?:devo|puoi|voglio)\s+(?:studio|vado|mangio)\b/i,'After a modal, use an infinitive: devo studiare, puoi andare, voglio mangiare.']
 ];
 for(const [pattern,tip] of rules) if(pattern.test(value))checks.push(tip);
 return {correct:null,status:'review',feedback:checks.length?'Review these specific points.':'Your writing is saved. Compare meaning, grammar and register with the example.',model:task.model||'',checks,method:'bounded-writing-coach',limitation:'This checks selected patterns, not every possible Italian sentence. No automatic writing pass is awarded.'};
}
export function skillEvidence(records) {
 const attempts=records.filter(r=>r.kind==='attempt');const bySkill=new Map();
 for(const r of attempts){const key=r.value.skill||r.value.lesson;const group=bySkill.get(key)||[];group.push(r);bySkill.set(key,group);}
 return [...bySkill].map(([skill,list])=>{
  list.sort((a,b)=>Date.parse(a.created)-Date.parse(b.created));const last=list.at(-1),v=last.value;
  const independent=list.filter(r=>r.value.correct===true&&!r.value.assisted&&!r.value.retry&&!r.value.imported&&r.value.stage!=='guided');
  const retained=independent.some(r=>independent.some(p=>r.value.task!==p.value.task&&Date.parse(r.created)-Date.parse(p.created)>=86400000));
  const status=v.correct===false?'Needs practice':v.correct===null?'Writing review':retained?'Retained':independent.length?'Independent':v.correct===true?'Correct with practice':'Practised';
  return {skill,status,attempts:list.length,firstTry:independent.length};
 });
}
