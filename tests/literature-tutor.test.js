import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { installLiteratureTutor } from '../server/grading/literature-tutor.js';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const express = require('express');
test('Personal tutor requires authentication and confirmation, applies server rubric and preserves pending on AI failure', async t => {
 const app = express(); app.use(express.json());
 installLiteratureTutor(app, { requireSameOrigin: (req,res,next) => req.get('origin') === 'https://test' ? next() : res.sendStatus(403), requireAuth: (req,res,next) => { if (!req.get('x-user')) return res.sendStatus(401); req.user = {id:'1'}; next(); }, generate: async ({data}) => ({questions:data.questions.map(q => ({targetId:q.targetId,confidence:1,criteria:q.criteria.map(c => ({id:c.id,points:c.maxPoints,feedback:'Có căn cứ',evidence:[q.studentAnswer]}))}))}) });
 const server = app.listen(0); t.after(() => {server.closeAllConnections(); server.close();}); await new Promise(r => server.once('listening',r));
 const post = (path, body, auth=true) => fetch(`http://localhost:${server.address().port}/api/literature/${path}`, {method:'POST',headers:{'content-type':'application/json',origin:'https://test',...(auth?{'x-user':'1'}:{})},body:JSON.stringify(body)});
 const body = {prompt:'Bàn về lòng biết ơn',answer:'Lòng biết ơn giúp chúng ta trân trọng cuộc sống.',kind:'II-1',confirmed:true};
 assert.equal((await post('tutor',body,false)).status,401);
 assert.equal((await post('tutor',{...body,confirmed:false})).status,400);
 assert.equal((await post('tutor',{...body,kind:'unknown'})).status,400);
 const response = await post('tutor',body); assert.equal(response.status,200); const result = await response.json();
 assert.equal(result.score,null); assert.equal(result.proposedScore,2); assert.equal(result.maximumPoints,2); assert.equal(result.result.criteria.length,4);
 assert.equal((await post('transcribe',{image:'data:image/png;base64,ZmFrZQ=='})).status,400);
});

test('Text tutor preserves both pasted fields through NVIDIA, accepts fenced rubric JSON and reports service failures separately', async t => {
 const { createLiteratureGenerator } = await import('../server/grading/literature-ai.js');
 const env = { LITERATURE_AI_PROVIDER: 'nvidia', LITERATURE_AI_API_KEY: 'fixture-key', LITERATURE_AI_MODEL: 'nvidia/fixture-chat' };
 const body = { prompt: 'Viết bài nghị luận về tôn trọng sự khác biệt.', answer: 'Tôn trọng sự khác biệt giúp chúng ta đoàn kết.\nMỗi cá nhân đều có giá trị riêng.', kind: 'II-1', confirmed: true };
 let mode = 'success'; let calls = 0;
 const generate = createLiteratureGenerator({env, fetcher: async (_url, options) => {
   calls++;
   const data = JSON.parse(JSON.parse(options.body).messages[1].content);
   assert.equal(data.passage, body.prompt);
   assert.equal(data.questions[0].studentAnswer, body.answer);
   assert.equal(data.questions.length, 1);
   if (mode === 'auth') return new Response('private provider details', {status: 401});
   const result = {questions: data.questions.map(q => ({targetId: q.targetId, confidence: 1, criteria: q.criteria.map(c => ({id:c.id, points:c.maxPoints, feedback:'Có căn cứ', evidence:['Mỗi cá nhân đều có giá trị riêng.']}))}))};
   if (mode === 'rubric') result.questions[0].criteria[0].evidence = ['trích dẫn không tồn tại'];
   return new Response(JSON.stringify({choices:[{finish_reason: mode === 'length' ? 'length' : 'stop',message:{content:'```json\n'+JSON.stringify(result)+'\n```'}}]}));
 }});
 const app = express(); app.use(express.json());
 installLiteratureTutor(app,{requireSameOrigin:(_req,_res,next)=>next(),requireAuth:(req,_res,next)=>{req.user={id:'text-fixture'};next();},generate});
 const server=app.listen(0); t.after(()=>{server.closeAllConnections();server.close();}); await new Promise(r=>server.once('listening',r));
 const post=()=>fetch(`http://localhost:${server.address().port}/api/literature/tutor`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const response=await post(); assert.equal(response.status,200); const result=await response.json();
 assert.equal(result.proposedScore,2); assert.equal(result.result.userAnswer,body.answer); assert.equal(result.score,null);
 for (const [failure,code] of [['auth','AI_AUTH_INVALID'],['length','AI_RESPONSE_TRUNCATED'],['rubric','AI_RUBRIC_INVALID']]) {
   mode=failure; const failed=await post(); assert.equal(failed.status,202); const data=await failed.json();
   assert.equal(data.errorCode,code); assert.equal(data.proposedScore,null); assert.equal(data.score,null);
   assert.ok(!JSON.stringify(data).includes('private provider details')); assert.ok(!JSON.stringify(data).includes(env.LITERATURE_AI_API_KEY));
 }
 assert.equal(calls,5);
});
