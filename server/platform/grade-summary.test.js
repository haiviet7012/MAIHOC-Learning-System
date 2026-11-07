import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeSummary } from '../grade-summary.js';
test('Weighted grade averages keep subjects and terms separate',()=>{
 const row=(score,weight,term='HK1')=>({student_id:1,payload:{score,weight,subject:'Toán',term}});
 assert.deepEqual(gradeSummary([row(8,1),row(6,2),row(10,1,'HK2')]).map(x=>x.average),[6.67,10]);
});
