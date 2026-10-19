import {readFileSync,writeFileSync,cpSync,mkdirSync} from 'node:fs';
import {expandCourse} from '../src/course.mjs';
const base=JSON.parse(readFileSync(new URL('../base-content.json',import.meta.url),'utf8'));
const content=expandCourse(base);
content.lessons.find(l=>l.id==='D01').tasks.push({id:'D01-HELLO',prompt:'Write an Italian hello suitable for meeting someone during the day. More than one greeting is accepted.',answers:['ciao','salve','buongiorno'],explanation:'Ciao is informal, salve is a general greeting, and buongiorno is a polite daytime greeting.',stage:'independent'});
// Convert legacy choice prompts to actual buttons when the alternatives are explicit.
for(const l of content.lessons)for(const t of l.tasks){
 if(t.answers?.length && !t.options){const m=t.prompt.match(/([\p{L}’']+)\s*\/\s*([\p{L}’']+)/u);if(m&&t.answers.some(a=>[m[1],m[2]].includes(a)))t.options=[m[1],m[2]];}
}
mkdirSync('dist',{recursive:true});cpSync('public','dist',{recursive:true});
writeFileSync('src/content.json',JSON.stringify(content));
// Assessment answers remain server-only; lesson keys are returned only after an attempt.
const visible=structuredClone(content);
for(const l of visible.lessons)for(const t of l.tasks){delete t.answers;delete t.model;delete t.explanation;}
for(const e of visible.exams)for(const q of e.questions){delete q.answers;delete q.model;delete q.explanation;}
writeFileSync('dist/content.json',JSON.stringify(visible));
console.log(`${content.lessons.length} lessons, ${content.cards.length} cards, ${content.exams.length} checkpoints built.`);
