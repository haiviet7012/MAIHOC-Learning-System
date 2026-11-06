import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateReport, installLegacyReports } from '../server/school-reports.js';
import { createRequire } from 'node:module';
const require=createRequire(new URL('../server/package.json',import.meta.url));const express=require('express');
test('Attendance counts late as attended and does not invent a rate for empty data; progress separates terms',()=>{
 assert.equal(aggregateReport([],[]).attendanceRate,null);
 const row=(student,score,weight,term)=>({kind:'grade',student_id:student,created_at:'2026-11-06',payload:{subject:'Toán',term,score,weight}});
 const data=aggregateReport([row(1,0,1,'HK1'),row(1,10,1,'HK1'),row(2,9,1,'HK1'),row(1,10,1,'HK2'),...['present','late','excused','unexcused'].map(status=>({kind:'attendance',payload:{status}}))],[]);
 assert.equal(data.attendanceRate,50);assert.equal(data.trend.find(r=>r.term==='HK1').average,7);assert.equal(data.trend.find(r=>r.term==='HK2').average,10);
});
test('Feedback is authorized against class assignment and membership and targets exactly one student',async t=>{
 const sent=[];const db={prepare(sql){return {get:async(...args)=>sql.includes('school_teacher_assignments')?(args[0]===1?{id:1}:null):args[1]===3?{user_id:3}:null};}};
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={id:Number(req.headers['x-user']),name:'Giáo viên'};next();});
 installLegacyReports(app,{db,requireAuth:(_req,_res,next)=>next(),requireSameOrigin:(req,res,next)=>req.headers.origin==='https://test'?next():res.sendStatus(403),canAccessClass:async()=>true,isSuperAdminUser:()=>false,notifyUser:async(...args)=>sent.push(args)});
 app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.message}));const server=app.listen(0);await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close();});
 const post=(id,sid,message,origin='https://test')=>fetch(`http://localhost:${server.address().port}/api/school/classes/10A1/students/${sid}/feedback`,{method:'POST',headers:{'content-type':'application/json','x-user':String(id),origin},body:JSON.stringify({message})});
 assert.equal((await post(2,3,'No')).status,403);assert.equal((await post(1,4,'No')).status,404);assert.equal((await post(1,3,42)).status,400);assert.equal((await post(1,3,'OK','https://evil')).status,403);
 assert.equal((await post(1,3,'Em đã tiến bộ.')).status,200);assert.equal(sent.length,1);assert.equal(sent[0][0],3);assert.equal(sent[0][1],'teacher_feedback');assert.ok(sent[0][3].includes('Em đã tiến bộ.'));
});
