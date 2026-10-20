import {readFileSync} from 'node:fs';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {review,skillEvidence} from '../src/grading.mjs';
const content=JSON.parse(readFileSync(new URL('../src/content.json',import.meta.url),'utf8'));
const cookieName='italian_session',refreshName='italian_refresh';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const hash=s=>createHash('sha256').update(s).digest('hex');
export function createHandler({env=process.env,fetcher=fetch,now=()=>new Date()}={}) {
 return async function handler(req,res) {
  const json=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
  const origin=env.APP_ORIGIN||'http://127.0.0.1:4320';
  const cookie=(name,value,age)=>`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${origin.startsWith('https:')?'; Secure':''}`;
  const sessions=data=>res.setHeader('Set-Cookie',[cookie(cookieName,data.access_token,Math.max(60,data.expires_in||3600)),cookie(refreshName,data.refresh_token,60*60*24*30)]);
  const clear=()=>res.setHeader('Set-Cookie',[cookie(cookieName,'',0),cookie(refreshName,'',0)]);
  try {
   const url=new URL(req.url,origin);let path=url.searchParams.get('route')||url.pathname.replace(/^\/api\/?/,'');
   if(!['GET','POST'].includes(req.method))throw fail('Method not allowed.',405);
   if(req.method==='POST'&&(req.headers.origin!==origin||!req.headers['content-type']?.startsWith('application/json')))throw fail('Reload this site before submitting.',403);
   if(path==='health')return json(200,{app:'italian-studio',version:'1.1.0',accounts:!!(env.SUPABASE_URL&&env.SUPABASE_ANON_KEY&&env.SUPABASE_SERVICE_ROLE_KEY),aiTeacher:!!(env.CF_ACCOUNT_ID&&env.CF_AI_TOKEN)});
   if(path==='review'){
    if(req.method!=='POST')throw fail('Submit an answer with the lesson form.',405);
    let input=req.body;
    if(input===undefined){const parts=[];let size=0;for await(const part of req){size+=part.length;if(size>20000)throw fail('Answer too large.',413);parts.push(part);}input=Buffer.concat(parts).toString();}
    const value=typeof input==='string'?JSON.parse(input):input;
    const l=content.lessons.find(x=>x.id===value?.lesson),t=l?.tasks.find(x=>x.id===value?.task);
    if(!t||typeof value.response!=='string')throw fail('Choose an activity and write an answer.');
    return json(200,{id:randomUUID(),kind:'attempt',created:now().toISOString(),value:{lesson:l.id,task:t.id,response:value.response,...review(t,value.response),stage:t.stage,skill:l.skill||l.id,guest:true,assisted:!!value.assisted}});
   }
   if(!env.SUPABASE_URL||!env.SUPABASE_ANON_KEY||!env.SUPABASE_SERVICE_ROLE_KEY)throw fail('Accounts are being connected. You can explore lessons while setup finishes.',503);
   const upstream=async(endpoint,{method='GET',body,token,key=env.SUPABASE_ANON_KEY}={})=>{
    const r=await fetcher(env.SUPABASE_URL+endpoint,{method,headers:{apikey:key,Authorization:`Bearer ${token||key}`,'Content-Type':'application/json',Prefer:'return=representation'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
    const raw=await r.text();let data;try{data=raw?JSON.parse(raw):null;}catch{throw fail('The account service is temporarily unavailable.',503);}
    if(!r.ok)throw fail(r.status===429?'Too many requests. Please wait before trying again.':endpoint.startsWith('/auth/')?(data?.msg||data?.message||data?.error_description||'Account request failed.'):'Could not save your progress. Please retry.',r.status===401?401:r.status===429?429:400);
    return data;
   };
   const admin=(endpoint,options={})=>upstream(endpoint,{...options,key:env.SUPABASE_SERVICE_ROLE_KEY});
   let b={};
   if(req.method==='POST'){
    if(req.body!==undefined)b=typeof req.body==='string'?JSON.parse(req.body):req.body;
    else{let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>1000000)throw fail('This submission is too large.',413);chunks.push(chunk);}b=JSON.parse(Buffer.concat(chunks).toString()||'{}');}
    if(!b||typeof b!=='object'||Array.isArray(b)||JSON.stringify(b).length>1000000)throw fail('Invalid submission.');
   }
   const post=()=>{if(req.method!=='POST')throw fail('Use the form to submit.',405);};
   if(path==='email-preview'||path==='email-session'){
    post();if(typeof b.access_token!=='string'||b.access_token.length>10000)throw fail('This email link is invalid. Request a new one.');
    const verified=await upstream('/auth/v1/user',{token:b.access_token});
    if(path==='email-preview')return json(200,{email:verified.email});
    if(typeof b.refresh_token!=='string'||b.refresh_token.length>2000)throw fail('This email link is invalid. Request a new one.');
    const data=await upstream('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:b.refresh_token}});
    if(data.user?.id!==verified.id)throw fail('This email link does not match the account.',403);
    sessions(data);return json(200,{ok:true});
   }
   if(['signup','login','recover','verify'].includes(path)){
    post();const email=String(b.email||'').trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw fail('Enter a valid email address.');
    if(path==='recover'){await upstream('/auth/v1/recover',{method:'POST',body:{email}});return json(200,{message:'If this account exists, a recovery email is on its way. Follow its link, or enter its code below.'});}
    if(path==='verify'){
     if(!['signup','recovery'].includes(b.type)||!/^\d{6,10}$/.test(String(b.code)))throw fail('Enter the email verification code.');
     const data=await upstream('/auth/v1/verify',{method:'POST',body:{email,token:b.code,type:b.type}});sessions(data);return json(200,{ok:true});
    }
    if(typeof b.password!=='string'||b.password.length<10||b.password.length>128)throw fail('Use a password of 10–128 characters.');
    const data=path==='signup'?await upstream('/auth/v1/signup',{method:'POST',body:{email,password:b.password,data:{name:String(b.name||'Learner').slice(0,60),level:'A1'}}}):await upstream('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password:b.password}});
    if(data.access_token)sessions(data);return json(200,{ok:true,verify:!data.access_token,message:data.access_token?'Welcome back.':'Check your email. Follow the confirmation link, or enter a code if one is provided.'});
   }
   const cookies=Object.fromEntries(String(req.headers.cookie||'').split(';').map(c=>c.trim().split('=').map(decodeURIComponent)).filter(x=>x.length===2));
   let token=cookies[cookieName],user;
   try{if(token)user=await upstream('/auth/v1/user',{token});}catch(e){if(e.status!==401)throw e;}
   if(!user&&cookies[refreshName]){
    try{const data=await upstream('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:cookies[refreshName]}});sessions(data);token=data.access_token;user=data.user;}catch{clear();}
   }
   if(path==='me'&&!user)return json(200,{user:null});
   if(!user)throw fail('Sign in to save your learning.',401);
   const safeUser={id:user.id,name:user.user_metadata?.name||'Learner',email:user.email,level:user.user_metadata?.level||'A1'};
   const records=async(id=user.id)=>await admin(`/rest/v1/learning_records?user_id=eq.${encodeURIComponent(id)}&order=created.asc&limit=10000`);
   const save=async(kind,value,id=randomUUID())=>{
    const row={id,user_id:user.id,kind,created:now().toISOString(),value};
    // PATCH only known singleton drafts; ordinary attempts always get a server-generated identifier.
    if(id.startsWith('draft-')){const old=await admin(`/rest/v1/learning_records?user_id=eq.${user.id}&id=eq.${encodeURIComponent(id)}`);if(old.length){await admin(`/rest/v1/learning_records?user_id=eq.${user.id}&id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:{value,created:row.created}});return row;}}
    await admin('/rest/v1/learning_records',{method:'POST',body:row});return row;
   };
   if(path==='coach'){
    post();if(!env.CF_ACCOUNT_ID||!env.CF_AI_TOKEN)throw fail('The AI teacher is ready for its Cloudflare credentials.',503);
    if(!['answer','transcript','progress'].includes(b.mode))throw fail('Choose an AI teacher activity.');
    let learnerText='',context='';
    if(b.mode==='answer'){
     const lesson=content.lessons.find(x=>x.id===b.lesson),task=lesson?.tasks.find(x=>x.id===b.task);
     if(!task||typeof b.response!=='string'||!b.response.trim()||b.response.length>4000)throw fail('Submit a lesson answer first.');
     learnerText=b.response;context=`Level ${lesson.level||'A1'}. Lesson: ${lesson.title}. Task: ${task.prompt}. Rule or goal: ${lesson.rule||lesson.goal||lesson.scene||''}. Server result: ${JSON.stringify(review(task,b.response))}. The server result remains authoritative for closed questions.`;
    }else if(b.mode==='transcript'){
     if(typeof b.transcript!=='string'||!b.transcript.trim()||b.transcript.length>12000||!['A1','A2','B1'].includes(b.level))throw fail('Add a transcript and choose a level.');
     learnerText=b.transcript;context=`Italian speaking transcript for a ${b.level} learner. Task: ${String(b.prompt||'').slice(0,1000)}. Assess grammar, vocabulary, coherence and task completion from text only. Pronunciation and acoustic fluency are unassessed.`;
    }else{
     const all=await records(),attempts=all.filter(r=>r.kind==='attempt').slice(-100),sessionsDone=all.filter(r=>r.kind==='session'),exams=all.filter(r=>r.kind==='exam').slice(-9),spoken=all.filter(r=>r.kind==='speaking').slice(-10);
     learnerText=JSON.stringify({level:safeUser.level,completedLessons:sessionsDone.map(r=>r.value.lesson),recentAttempts:attempts.map(r=>({lesson:r.value.lesson,task:r.value.task,correct:r.value.correct,stage:r.value.stage,assisted:r.value.assisted,retry:r.value.retry})),checkpoints:exams.map(r=>({exam:r.value.exam,score:r.value.score,passed:r.value.passed})),speaking:spoken.map(r=>({level:r.value.level,status:r.value.status}))});
     context='Summarise learning evidence without inventing mastery. Prioritise two repair targets and a short next-session plan. Do not award CEFR certification.';
    }
    const system=`You are the Italian Language Studio teacher for adult English- and Urdu-speaking learners. Be accurate, encouraging and concise. Preserve the learner's intended facts. Explain Italian in plain English and add one useful Urdu grammar comparison only when it genuinely clarifies the point. Never infer pronunciation from a transcript. Never override deterministic answer keys or award an official CEFR level. Return only valid JSON with keys summary, corrected, explanation, englishComparison, urduComparison, nextExercise, strengths, priorities, limitation. Each value must be a string, except strengths and priorities which are arrays of up to three short strings.`;
    const request={model:env.CF_AI_MODEL||'google/gemini-4-argon',input:{contents:[{role:'user',parts:[{text:`${context}\n\nLearner material:\n${learnerText}`}]}],systemInstruction:{parts:[{text:system}]},generationConfig:{thinkingConfig:{thinkingLevel:'LOW'}}}};
    const response=await fetcher(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CF_ACCOUNT_ID)}/ai/run`,{method:'POST',headers:{Authorization:`Bearer ${env.CF_AI_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(30000)});
    const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{throw fail('The AI teacher returned an unreadable response.',503);}if(!response.ok||data.success===false)throw fail(data.errors?.[0]?.message||'The AI teacher is temporarily unavailable.',503);
    const result=data.result??data,modelText=result.response||result.output_text||result.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('')||result.choices?.[0]?.message?.content;
    if(typeof modelText!=='string')throw fail('The AI teacher returned no written feedback.',503);
    let feedback;try{feedback=JSON.parse(modelText.replace(/^```json\s*|\s*```$/g,''));}catch{feedback={summary:modelText,corrected:'',explanation:'',englishComparison:'',urduComparison:'',nextExercise:'',strengths:[],priorities:[],limitation:'AI feedback is provisional.'};}
    const safe={mode:b.mode,summary:String(feedback.summary||'').slice(0,2000),corrected:String(feedback.corrected||'').slice(0,4000),explanation:String(feedback.explanation||'').slice(0,4000),englishComparison:String(feedback.englishComparison||'').slice(0,2000),urduComparison:String(feedback.urduComparison||'').slice(0,2000),nextExercise:String(feedback.nextExercise||'').slice(0,3000),strengths:Array.isArray(feedback.strengths)?feedback.strengths.slice(0,3).map(x=>String(x).slice(0,500)):[],priorities:Array.isArray(feedback.priorities)?feedback.priorities.slice(0,3).map(x=>String(x).slice(0,500)):[],limitation:String(feedback.limitation||'AI feedback is provisional and may be wrong.').slice(0,1000),lesson:b.lesson||null,task:b.task||null,level:b.level||safeUser.level,model:env.CF_AI_MODEL||'google/gemini-4-argon'};
    const row=await save('coach',safe);return json(200,{...row.value,id:row.id,created:row.created});
   }
   if(path==='me'){const rows=await records();return json(200,{user:safeUser,records:rows,evidence:skillEvidence(rows)});}
   if(path==='logout'){post();await upstream('/auth/v1/logout',{method:'POST',token});clear();return json(200,{ok:true});}
   if(path==='profile'){post();const data={name:String(b.name||safeUser.name).slice(0,60),level:['A1','A2','B1'].includes(b.level)?b.level:safeUser.level};await upstream('/auth/v1/user',{method:'PUT',token,body:{data}});return json(200,{ok:true});}
   if(path==='password'){post();if(typeof b.password!=='string'||b.password.length<10||b.password.length>128)throw fail('Use 10–128 characters.');await upstream('/auth/v1/user',{method:'PUT',token,body:{password:b.password}});return json(200,{ok:true});}
   if(path==='attempt'){
    post();const l=content.lessons.find(x=>x.id===b.lesson),t=l?.tasks.find(x=>x.id===b.task);if(!t)throw fail('Choose a lesson activity.');
    if(typeof b.response!=='string')throw fail('Enter a written answer.');
    const result=review(t,b.response);const previous=(await records()).filter(r=>r.kind==='attempt'&&r.value.lesson===l.id&&r.value.task===t.id);
    const row=await save('attempt',{lesson:l.id,task:t.id,response:b.response,...result,skill:l.skill||l.id,stage:t.stage,assisted:!!b.assisted,retry:previous.length>0,version:content.version});return json(200,row);
   }
   if(path==='session'){post();const l=content.lessons.find(x=>x.id===b.lesson);if(!l)throw fail('Lesson not found.');const all=await records();if(!l.tasks.every(t=>all.some(r=>r.kind==='attempt'&&r.value.lesson===l.id&&r.value.task===t.id)))throw fail('Try each activity before finishing the lesson.');return json(200,await save('session',{lesson:l.id,level:l.level||'A1'}));}
   if(path==='draft'){post();if(!content.lessons.some(x=>x.id===b.lesson)||typeof b.text!=='string'||b.text.length>4000)throw fail('Invalid draft.');return json(200,await save('draft',{lesson:b.lesson,text:b.text},'draft-'+b.lesson));}
   if(path==='card'){post();if(!content.cards.some(x=>x.id===b.card)||!['again','hard','good'].includes(b.rating))throw fail('Choose a card and rating.');const days={again:0,hard:1,good:3}[b.rating];return json(200,await save('card',{card:b.card,rating:b.rating,due:new Date(now().getTime()+days*86400000+(days?0:600000)).toISOString(),dimension:'recall-self-report'}));}
   if(path==='exam'){
    post();const exam=content.exams.find(x=>x.id===b.exam);if(!exam||!b.answers||typeof b.writing!=='string'||!b.writing.trim()||b.writing.length>4000)throw fail('Complete the test and writing task.');
    const all=await records();const n=Number(exam.id.slice(-1));if(n>1&&!all.some(r=>r.kind==='exam'&&r.value.exam===`${exam.level}-test-${n-1}`&&r.value.passed))throw fail('Pass the previous checkpoint first.');
    const latest=all.filter(r=>r.kind==='exam'&&r.value.exam===exam.id).at(-1);if(latest&&now()-new Date(latest.created)<86400000)throw fail('Return tomorrow for another checkpoint attempt. Practise your repair items meanwhile.');
    const results=exam.questions.map(q=>({task:q.id,response:String(b.answers[q.id]||''),...review(q,b.answers[q.id])}));const score=Math.round(results.filter(x=>x.correct).length/results.length*100);
    return json(200,await save('exam',{exam:exam.id,level:exam.level,score,passed:score>=exam.pass,results,writing:b.writing,writingReview:review({model:'Use a clear beginning, relevant details, linking words and a closing.'},b.writing),writingStatus:'review-needed',version:content.version}));
   }
   if(path==='speaking'){post();if(!['A1','A2','B1'].includes(b.level)||typeof b.transcript!=='string'||!b.transcript.trim()||b.transcript.length>12000||String(b.feedback||'').length>16000)throw fail('Add a transcript and choose a level.');return json(200,await save('speaking',{level:b.level,transcript:b.transcript,feedback:String(b.feedback||''),status:'external-feedback-unverified'}));}
   if(path==='backup'){const rows=await records();return json(200,{app:'italian-studio',schema:2,exported:now().toISOString(),records:rows.map(({user_id,...r})=>r)});}
   if(path==='import'){
    post();if(b.app!=='italian-studio'||![1,2].includes(b.schema)||!Array.isArray(b.records)||b.records.length>1000)throw fail('Choose an Italian Studio backup with up to 1,000 records.');
    let count=0;for(const r of b.records){if(r.kind!=='attempt')continue;const l=content.lessons.find(x=>x.id===r.value?.lesson),t=l?.tasks.find(x=>x.id===r.value?.task);if(!t||typeof r.value.response!=='string'||!r.value.response.trim()||r.value.response.length>4000)continue;const id='import-'+hash(JSON.stringify({id:r.id,lesson:l.id,task:t.id,response:r.value.response}));const exists=await admin(`/rest/v1/learning_records?user_id=eq.${user.id}&id=eq.${id}&select=id`);if(exists.length)continue;await save('attempt',{lesson:l.id,task:t.id,response:r.value.response,...review(t,r.value.response),skill:l.skill||l.id,stage:t.stage,imported:true,assisted:true,version:content.version},id);count++;}return json(200,{count});
   }
   if(path==='family'){
    const links=await admin(`/rest/v1/family_links?or=(owner_id.eq.${user.id},learner_id.eq.${user.id})&order=created.desc&limit=100`);const members=[];
    for(const link of links.filter(x=>x.owner_id===user.id&&x.learner_id)){
     const rows=await records(link.learner_id);const person=await admin('/auth/v1/admin/users/'+link.learner_id);
     members.push({id:link.id,name:person.user?.user_metadata?.name||person.user_metadata?.name||'Learner',lessons:new Set(rows.filter(r=>r.kind==='session').map(r=>r.value.lesson)).size,evidence:skillEvidence(rows),tests:rows.filter(r=>r.kind==='exam').map(r=>({exam:r.value.exam,score:r.value.score})),lastActive:rows.at(-1)?.created});
    }
    return json(200,{members,sharing:links.filter(x=>x.learner_id===user.id).map(x=>({id:x.id,created:x.created})),pending:links.filter(x=>x.owner_id===user.id&&!x.learner_id&&Date.parse(x.expires)>now().getTime()).length});
   }
   if(path==='family-invite'){post();const links=await admin(`/rest/v1/family_links?owner_id=eq.${user.id}&select=id`);if(links.length>=20)throw fail('Limit of 20 family invitations reached.');const code=randomBytes(12).toString('hex');await admin('/rest/v1/family_links',{method:'POST',body:{owner_id:user.id,code_hash:hash(code),expires:new Date(now().getTime()+7*86400000).toISOString()}});return json(200,{code});}
   if(path==='family-join'){post();if(b.consent!==true||! /^[a-f0-9]{24}$/.test(String(b.code)))throw fail('Enter the invitation code and agree to share your progress.');const links=await admin(`/rest/v1/family_links?code_hash=eq.${hash(b.code)}&learner_id=is.null`);const link=links[0];if(!link||Date.parse(link.expires)<=now().getTime()||link.owner_id===user.id)throw fail('This invitation cannot be used.');const joined=await admin(`/rest/v1/family_links?id=eq.${link.id}&learner_id=is.null`,{method:'PATCH',body:{learner_id:user.id}});if(!joined?.length)throw fail('This invitation has already been used.');return json(200,{ok:true});}
   if(path==='family-unlink'){post();if(!/^[a-f0-9-]{36}$/.test(String(b.id)))throw fail('Invalid family link.');await admin(`/rest/v1/family_links?id=eq.${b.id}&or=(owner_id.eq.${user.id},learner_id.eq.${user.id})`,{method:'DELETE'});return json(200,{ok:true});}
   throw fail('Page not found.',404);
  }catch(e){return json(e.status||400,{error:e.status?e.message:'Unable to complete this request. Please try again.'});}
 };
}
export default createHandler();
