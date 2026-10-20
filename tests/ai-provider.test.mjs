import test from 'node:test';
import assert from 'node:assert/strict';
import {aiConfig,requestTeacher} from '../src/ai-provider.mjs';
const input={contents:[{role:'user',parts:[{text:'Io avere fame.'}]}],systemInstruction:{parts:[{text:'Return feedback JSON.'}]}};
test('Google takes precedence and keeps the key in a server header',async()=>{
 const env={GEMINI_API_KEY:'test-private',CF_ACCOUNT_ID:'cf-account',CF_AI_TOKEN:'cf-private'};
 assert.equal(aiConfig(env).provider,'google');
 let count=0;
 const result=await requestTeacher(env,async(url,options)=>{
  count++;
  assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
  assert.equal(options.headers['x-goog-api-key'],'test-private');
  assert.ok(!url.includes('test-private'));
  const body=JSON.parse(options.body);
  assert.deepEqual(body.contents,input.contents);
  assert.equal(body.generationConfig.responseMimeType,'application/json');
  assert.equal(body.generationConfig.thinkingConfig,undefined);
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'{"summary":"Use ho fame."}'}]}}]}));
 },{input});
 assert.equal(count,1);
 assert.ok((await result.json()).candidates.length);
});
test('quota errors are safe and never fall back to a second paid service',async()=>{
 let calls=0;
 await assert.rejects(requestTeacher({GEMINI_API_KEY:'secret',CF_AI_TOKEN:'fallback'},async()=>{
  calls++;return new Response('secret upstream diagnostics',{status:429});
 },{input}),e=>e.status===429&&!e.message.includes('secret')&&e.message.includes('usage limit'));
 assert.equal(calls,1);
});
test('missing key leaves Cloudflare compatibility and disabled state intact',()=>{
 assert.equal(aiConfig({}).enabled,false);
 assert.equal(aiConfig({GEMINI_API_KEY:'  ',CF_ACCOUNT_ID:'id',CF_AI_TOKEN:'token'}).provider,'cloudflare');
 assert.equal(aiConfig({GEMINI_API_KEY:'key',GEMINI_MODEL:'custom-model'}).model,'custom-model');
});
