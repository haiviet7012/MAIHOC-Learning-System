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
