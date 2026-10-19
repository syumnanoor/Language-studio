import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../api/index.js';
const env={APP_ORIGIN:'https://italianlanguagestudio.vercel.app',SUPABASE_URL:'https://db.example',SUPABASE_ANON_KEY:'public-test-key',SUPABASE_SERVICE_ROLE_KEY:'private-test-key'};
const users={alpha:{id:'11111111-1111-4111-a111-111111111111',email:'a@example.test',user_metadata:{name:'A'}},beta:{id:'22222222-2222-4222-a222-222222222222',email:'b@example.test',user_metadata:{name:'B'}}};
function harness(){const rows=[],links=[];let calls=[];const fetcher=async(url,opts)=>{
 const u=new URL(url),token=opts.headers.Authorization.replace('Bearer ',''),body=opts.body?JSON.parse(opts.body):null;calls.push({url,opts});
 const respond=(data,status=200)=>new Response(data===null?'':JSON.stringify(data),{status});
 if(u.pathname==='/auth/v1/user')return users[token]?respond(users[token]):respond({message:'Invalid session'},401);
 if(u.pathname.startsWith('/auth/v1/admin/users/'))return respond(Object.values(users).find(x=>x.id===u.pathname.split('/').at(-1)));
 if(u.pathname==='/rest/v1/learning_records'){
  assert.equal(token,'private-test-key');
  if(opts.method==='POST'){rows.push(body);return respond([body]);}
  const uid=u.searchParams.get('user_id')?.slice(3),id=u.searchParams.get('id')?.slice(3);
  return respond(rows.filter(r=>(!uid||r.user_id===uid)&&(!id||r.id===id)));
 }
 if(u.pathname==='/rest/v1/family_links'){
  if(opts.method==='POST'){const row={id:'33333333-3333-4333-a333-333333333333',learner_id:null,...body};links.push(row);return respond([row]);}
  let selected=links.filter(l=>{const code=u.searchParams.get('code_hash'),owner=u.searchParams.get('owner_id'),id=u.searchParams.get('id'),or=u.searchParams.get('or');return (!code||l.code_hash===code.slice(3))&&(!owner||l.owner_id===owner.slice(3))&&(!id||l.id===id.slice(3))&&(!or||or.includes(l.owner_id)||or.includes(l.learner_id))&&(!u.searchParams.has('learner_id')||l.learner_id===null);});
  if(opts.method==='PATCH'){selected.forEach(l=>Object.assign(l,body));return respond(selected);}
  if(opts.method==='DELETE'){for(const l of selected)links.splice(links.indexOf(l),1);return respond([]);}
  return respond(selected);
 }
 throw Error('Unexpected mocked request '+url);
 };const handler=createHandler({env,fetcher,now:()=>new Date('2026-10-20T00:00:00Z')});
 async function call(path,body,who='alpha',origin=env.APP_ORIGIN){let result,headers={};const req={url:'/api/'+path,method:body===undefined?'GET':'POST',headers:{cookie:who?'italian_session='+who:'',origin,'content-type':'application/json'},body};const res={statusCode:200,setHeader:(k,v)=>headers[k]=v,end:s=>result={status:res.statusCode,body:JSON.parse(s),headers}};await handler(req,res);return result;}
 return {call,rows,links,calls};}
test('unauthenticated and cross-origin writes are rejected',async()=>{const h=harness();assert.equal((await h.call('attempt',{lesson:'D01',task:'D01-I',response:'ciao'},'')).status,401);assert.equal((await h.call('attempt',{},'alpha','https://evil.test')).status,403);assert.equal(h.rows.length,0);});
test('server marks answers, ignores forged grades and isolates learner records',async()=>{const h=harness();const r=await h.call('attempt',{lesson:'D01',task:'D01-I',response:'grazie',correct:true,user_id:users.beta.id});assert.equal(r.body.value.correct,false);assert.equal(h.rows[0].user_id,users.alpha.id);assert.equal((await h.call('me',undefined,'beta')).body.records.length,0);assert.equal((await h.call('me')).body.records.length,1);const retry=await h.call('attempt',{lesson:'D01',task:'D01-I',response:'Ciao'});assert.equal(retry.body.value.retry,true);assert.equal(retry.body.value.correct,true);});
test('cannot finish an unattempted lesson or jump to checkpoint 2',async()=>{const h=harness();assert.equal((await h.call('session',{lesson:'D01'})).status,400);assert.equal((await h.call('exam',{exam:'A1-test-2',answers:{},writing:'Ciao.'})).status,400);assert.equal(h.rows.length,0);});
test('family invitation requires consent, is single-use and shares only summaries',async()=>{const h=harness();await h.call('attempt',{lesson:'D01',task:'D01-I',response:'Ciao'},'beta');const invite=await h.call('family-invite',{});assert.equal(invite.body.code.length,24);assert.notEqual(h.links[0].code_hash,invite.body.code);assert.equal((await h.call('family-join',{code:invite.body.code},'beta')).status,400);assert.equal((await h.call('family-join',{code:invite.body.code,consent:true},'beta')).status,200);const family=await h.call('family');assert.equal(family.body.members.length,1);assert.equal(JSON.stringify(family.body).includes('Ciao'),false);assert.equal((await h.call('family-join',{code:invite.body.code,consent:true},'beta')).status,400);await h.call('family-unlink',{id:h.links[0].id},'beta');assert.equal((await h.call('family')).body.members.length,0);});
test('import regrades attempts, never imports forged exam passes, and is idempotent',async()=>{const h=harness();const backup={app:'italian-studio',schema:1,records:[{id:'old',kind:'attempt',value:{lesson:'D01',task:'D01-I',response:'grazie',correct:true}},{id:'fake',kind:'exam',value:{passed:true}}]};assert.equal((await h.call('import',backup)).body.count,1);assert.equal(h.rows[0].value.correct,false);assert.equal(h.rows[0].value.imported,true);assert.equal((await h.call('import',backup)).body.count,0);assert.equal(h.rows.length,1);});
