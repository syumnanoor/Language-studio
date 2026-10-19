import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {review,skillEvidence} from '../src/grading.mjs';
const content=JSON.parse(readFileSync(new URL('../src/content.json',import.meta.url)));
test('case, synonyms, accents and targeted punctuation have distinct rules',()=>{
 const greeting={answers:['ciao','salve','buongiorno']};for(const x of ['ciao','Ciao',' SALVE ','Buongiorno!'])assert.equal(review(greeting,x).correct,true);
 assert.equal(review({answers:['è']},'e').correct,false);
 assert.equal(review({answers:['Ciao, Sara!'],match:'exact'},'Ciao Sara!').correct,false);
 assert.equal(review({answers:['Studio italiano.'],match:'exact'},'Studio Italiano.').correct,false);
 assert.equal(review({answers:['te-le-fo-no'],match:'syllables'},'te - le - fo - no').correct,true);
 assert.equal(review({answers:['grazie']},'salve').correct,false);
});
test('free writing remains ungraded, with concrete repair tips',()=>{
 const r=review({},'Io ha un libro.');assert.equal(r.correct,null);assert.match(r.checks[0],/ho/);
 assert.equal(review({},'Salve, mi chiamo Sara.').correct,null);
});
test('96 A2/B1 lessons, stable legacy IDs and three checkpoints per level',()=>{
 assert.equal(content.lessons.filter(l=>l.group==='course').length,96);
 assert.equal(content.exams.length,9);assert.equal(new Set(content.lessons.map(x=>x.id)).size,content.lessons.length);
 for(const l of content.lessons){assert.ok(l.tasks.length>=3);assert.equal(new Set(l.tasks.map(t=>t.id)).size,l.tasks.length);for(const t of l.tasks)if(t.answers)assert.equal(review(t,t.answers[0]).correct,true);}
 assert.ok(content.lessons.some(x=>x.id==='FN09'));assert.ok(content.cards.some(x=>x.id==='A1-01'));
 for(const lv of ['A1','A2','B1'])assert.equal(content.exams.filter(e=>e.level===lv).length,3);
});
test('public assessment data contains no answer keys',()=>{
 const publicData=JSON.parse(readFileSync(new URL('../dist/content.json',import.meta.url)));
 for(const e of publicData.exams)for(const q of e.questions){assert.equal(q.answers,undefined);assert.equal(q.explanation,undefined);}
});
test('a corrected retry is not independent evidence; delayed distinct tasks can be retained',()=>{
 const row=(task,date,extra={})=>({kind:'attempt',created:date,value:{lesson:'x',skill:'x',task,correct:true,stage:'fresh',...extra}});
 assert.equal(skillEvidence([row('a','2026-01-01',{retry:true})])[0].status,'Correct with practice');
 assert.equal(skillEvidence([row('a','2026-01-01'),row('a','2026-01-03')])[0].status,'Independent');
 assert.equal(skillEvidence([row('a','2026-01-01'),row('b','2026-01-03')])[0].status,'Retained');
 assert.notEqual(skillEvidence([row('a','2026-01-01',{imported:true}),row('b','2026-01-03',{imported:true})])[0].status,'Retained');
});
