import test from 'node:test';
import assert from 'node:assert/strict';
import { geminiConfig, geminiConfigured, providerError, geminiClient, aiError } from '../ai-provider.js';
import { checkAi } from '../check-ai.js';
import { advise } from '../learning-advisor/gemini.js';
import { solveUniversalProblem } from '../ai-solver/service.js';
import { solveChemistryProblem } from '../chemistry/solver-service.js';
import { solveExamDocument } from '../grading/exam-solution-engine.js';

const fakeKey = 'AQ.fixture-not-a-real-key';
const env = { GEMINI_API_KEY:` "${fakeKey}" `, GEMINI_MODEL:' models/gemini-fixture ' };
const candidate = text => new Response(JSON.stringify({ candidates:[{ finishReason:'STOP', content:{role:'model',parts:[{text}]} }] }), {headers:{'Content-Type':'application/json'}});
const rejected = status => new Response(JSON.stringify({ error:{code:status,message:`API key not valid ${fakeKey}`,details:[{reason:'ACCESS_TOKEN_TYPE_UNSUPPORTED'}]} }),{status,headers:{'Content-Type':'application/json'}});

test('normalizes shared and dedicated config, honors precedence and accepts authorization keys',()=>{
  assert.equal(geminiConfig('shared',env).apiKey,fakeKey);
  assert.equal(geminiConfig('shared',env).model,'gemini-fixture');
  assert.equal(geminiConfig('advisor',{...env,LEARNING_ADVISOR_API_KEY:'  ',LEARNING_ADVISOR_MODEL:'  '}).keySource,'GEMINI_API_KEY');
  assert.equal(geminiConfig('advisor',{...env,LEARNING_ADVISOR_API_KEY:'dedicated',LEARNING_ADVISOR_MODEL:'gemini-advisor'}).model,'gemini-advisor');
  const exam = geminiConfig('exam',{...env,GEMINI_SOLUTION_API_KEY:'exam-only',GEMINI_SOLUTION_MODEL:'gemini-exam'});
  assert.equal(exam.model,'gemini-exam');
  assert.equal(exam.apiKey,'exam-only');
  assert.equal(exam.keySource,'GEMINI_SOLUTION_API_KEY');
  assert.equal(geminiConfig('exam',{...env,GEMINI_SOLUTION_API_KEY:'  '}).apiKey,fakeKey);
  assert.equal(geminiConfig('shared',{...env,GEMINI_SOLUTION_API_KEY:'exam-only'}).apiKey,fakeKey);
  assert.equal(geminiConfig('exam',{GEMINI_SOLUTION_API_KEY:'exam-only',GEMINI_SOLUTION_MODEL:'gemini-exam'}).apiKey,'exam-only');
  assert.equal(geminiConfig('shared',{...env,GEMINI_API_KEY:'',GOOGLE_API_KEY:'alias'}).apiKey,'alias');
  assert.equal(geminiConfigured('advisor', {GEMINI_API_KEY:' ',GEMINI_MODEL:'x'}),false);
  assert.throws(()=>geminiConfig('shared',{...env,GEMINI_API_KEY:'bad\nkey'}),e=>e.code==='AI_KEY_FORMAT');
  assert.throws(()=>geminiConfig('shared',{...env,GEMINI_MODEL:'https://invalid'}),e=>e.code==='AI_MODEL_MISSING');
});
test('classifies failures without exposing credentials or provider payload',()=>{
  for (const [status,reason,code] of [[401,'ACCESS_TOKEN_TYPE_UNSUPPORTED','AI_AUTH_INVALID'],[400,'API_KEY_INVALID','AI_AUTH_INVALID'],[403,'PERMISSION_DENIED','AI_PERMISSION_DENIED'],[429,'RESOURCE_EXHAUSTED','AI_QUOTA_EXHAUSTED'],[404,'NOT_FOUND','AI_MODEL_UNAVAILABLE'],[503,'UNAVAILABLE','AI_PROVIDER_UNAVAILABLE']]) {
    const error=providerError({status,message:`${reason}: ${fakeKey}`});
    assert.equal(error.code,code);
    assert.ok(!error.message.includes(fakeKey));
    assert.ok(!error.message.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED'));
    assert.equal(error.retryable,status===503);
  }
});
test('SDK sends key in header, never URL, and retains multimodal payload',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch=async(url,options)=>{
    assert.ok(!String(url).includes(fakeKey));
    assert.equal(new Headers(options.headers).get('x-goog-api-key'),fakeKey);
    const body=JSON.parse(options.body);
    assert.equal(body.contents[0].parts[0].inlineData.mimeType,'image/png');
    return candidate('Kết quả');
  };
  const result=await geminiClient(fakeKey).getGenerativeModel({model:'models/gemini-fixture'}).generateContent({contents:[{role:'user',parts:[{inlineData:{mimeType:'image/png',data:'eA=='}}]}]});
  assert.equal(result.response.text(),'Kết quả');
});
test('tutor, chemistry, exam and both advisor audiences stop on auth failure with safe error',async t=>{
  const originalFetch=globalThis.fetch, oldEnv={...process.env};
  t.after(()=>{globalThis.fetch=originalFetch;process.env=oldEnv;});
  Object.assign(process.env,env,{GEMINI_FALLBACK_MODELS:'gemini-fallback'});
  let calls=0;
  globalThis.fetch=async()=>{calls++;return rejected(401);};
  const requests=[
    ()=>solveUniversalProblem({prompt:'1+1',subject:'Toán',mode:'quick'}),
    ()=>solveChemistryProblem({prompt:'H2O',grade:'10',mode:'concise'}),
    ()=>solveExamDocument({buffer:Buffer.from('1+1'),filename:'fixture.txt',title:'Test',grading:{scale:10},customTargets:[{targetId:'I:1',number:1,type:'multiple_choice',maximumPoints:1}],modelName:'gemini-fixture',apiKey:fakeKey}),
    ...['student','teacher'].map(audience=>()=>advise({audience,mode:'chat',message:'Học tập'},{env,fetcher:globalThis.fetch}))
  ];
  for (const run of requests) {
    const before=calls;
    await assert.rejects(run,e=>e.code==='AI_AUTH_INVALID' && !e.message.includes(fakeKey));
    assert.equal(calls-before,1,'No retry or fallback for invalid credentials');
  }
});
test('tutor, chemistry and exam retain successful response formats',async t=>{
  const originalFetch=globalThis.fetch,oldEnv={...process.env};
  t.after(()=>{globalThis.fetch=originalFetch;process.env=oldEnv;});
  Object.assign(process.env,env,{GEMINI_FALLBACK_MODELS:''});
  globalThis.fetch=async()=>candidate('Lời giải');
  assert.equal((await solveUniversalProblem({prompt:'1+1',subject:'Toán',mode:'quick'})).answer,'Lời giải');
  globalThis.fetch=async()=>candidate(JSON.stringify({summary:'Tóm tắt',steps:[],finalAnswer:'Đáp án'}));
  assert.equal((await solveChemistryProblem({prompt:'H2O',grade:'10',mode:'concise'})).finalAnswer,'Đáp án');
  globalThis.fetch=async()=>candidate(JSON.stringify({questions:[{targetId:'I:1',answer:'A',confidence:1,explanation:'Kiểm tra',rubric:[]}]}));
  const result=await solveExamDocument({buffer:Buffer.from('1+1'),filename:'fixture.txt',title:'Test',grading:{scale:10},customTargets:[{targetId:'I:1',number:1,type:'multiple_choice',maximumPoints:1}],modelName:'gemini-fixture',apiKey:fakeKey});
  assert.equal(result.questions[0].answer,'A');
});
test('live diagnostic verifies each configured model using correct key, without publishing keys',async()=>{
  let listCalls=0,generateCalls=0;
  const results=await checkAi({env:{...env,LEARNING_ADVISOR_API_KEY:'dedicated',LEARNING_ADVISOR_MODEL:'gemini-advisor',GEMINI_SOLUTION_API_KEY:'exam-key',GEMINI_SOLUTION_MODEL:'gemini-exam'},generate:true,fetcher:async(url,options)=>{
    assert.ok(!url.includes(fakeKey));
    if(url.includes(':generateContent')) {generateCalls++;return candidate('OK');}
    listCalls++;
    const model=({'dedicated':'gemini-advisor','exam-key':'gemini-exam'})[options.headers['x-goog-api-key']] || 'gemini-fixture';
    return new Response(JSON.stringify({models:[{name:'models/'+model,supportedGenerationMethods:['generateContent']}]}));
  }});
  assert.equal(listCalls,3);assert.equal(generateCalls,3);
  assert.ok(results.every(r=>r.status==='GENERATE_VERIFIED'));
  assert.ok(!JSON.stringify(results).includes(fakeKey));
  assert.ok(!JSON.stringify(results).includes('exam-key'));
  assert.equal(results.find(r=>r.scope==='exam').keySource,'GEMINI_SOLUTION_API_KEY');
  const failure=await checkAi({env,live:true,fetcher:async()=>rejected(401)});
  assert.ok(failure.every(r=>r.status==='AI_AUTH_INVALID'));
  assert.ok(!JSON.stringify(failure).includes(fakeKey));
});

test('tutor only tries configured fallback for unavailable model, not invalid request',async t=>{
  const originalFetch=globalThis.fetch,oldEnv={...process.env};
  t.after(()=>{globalThis.fetch=originalFetch;process.env=oldEnv;});
  Object.assign(process.env,env,{GEMINI_FALLBACK_MODELS:'gemini-fallback'});
  let calls=0;
  globalThis.fetch=async()=>++calls===1
    ? new Response(JSON.stringify({error:{code:404,message:'Model not found'}}),{status:404})
    : candidate('Lời giải fallback');
  const result=await solveUniversalProblem({prompt:'1+1',subject:'Toán',mode:'quick'});
  assert.equal(calls,2);assert.equal(result.modelUsed,'gemini-fallback');
  calls=0;
  globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:{code:400,message:'Unsupported request'}}),{status:400});};
  await assert.rejects(()=>solveUniversalProblem({prompt:'1+1',subject:'Toán',mode:'quick'}),e=>e.code==='AI_REQUEST_INVALID');
  assert.equal(calls,1);
});
test('AI worker fails a permanent authentication error instead of requeuing it',async()=>{
  const { workOnce }=await import('../platform/worker.js');
  let state;
  const database={
    transaction:fn=>fn,
    query:async(sql,args)=>{
      if(sql.startsWith('WITH candidate')) return {rows:[{id:'fixture-job',user_id:1,attempts:1,payload:{prompt:'test'}}]};
      if(sql.includes('SET status=$3')) state=args[2];
      return {rows:[]};
    }
  };
  await workOnce({database,solve:async()=>{throw aiError('AI_AUTH_INVALID','Google từ chối key.');}});
  assert.equal(state,'failed');
});
