import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { testDatabase } from '../platform/test-db.js';
import { installClassroomAccess, closeEmptyClassrooms } from '../classroom-access.js';

test('empty classroom closes after ten minutes, resets on attendance and ignores outages',async()=>{
 const row={id:'session-test',empty_since:null,closed:false};let participants=[],outage=false,deletions=0;
 const db={prepare:sql=>({all:async()=>row.closed?[]:[{...row}],run:async(...args)=>{if(sql.includes('closed=true'))row.closed=true;else if(sql.includes('empty_since=NULL'))row.empty_since=null;else row.empty_since=args[0];}})};
 const live={listParticipants:async()=>{if(outage)throw Error('network');return participants;},deleteRoom:async()=>{deletions++;}};
 await closeEmptyClassrooms(db,live,1000);assert.equal(row.empty_since,1000);
 await closeEmptyClassrooms(db,live,600999);assert.equal(deletions,0);
 participants=[{identity:'student'}];await closeEmptyClassrooms(db,live,601000);assert.equal(row.empty_since,null);
 participants=[];await closeEmptyClassrooms(db,live,700000);assert.equal(row.empty_since,700000);
 outage=true;await closeEmptyClassrooms(db,live,1300000);assert.equal(row.closed,false);
 outage=false;await closeEmptyClassrooms(db,live,1300001);assert.equal(deletions,1);assert.equal(row.closed,true);
});

test('classrooms are always available, allow direct entry and report attendance',async()=>{
 const fixture=await testDatabase({memoryOnly:true});
 const env={...process.env};let server;
 try{
  Object.assign(process.env,{LIVEKIT_URL:'wss://fixture.invalid',LIVEKIT_API_KEY:'fixture',LIVEKIT_API_SECRET:'fixture-secret-long-enough-for-tests'});
  await fixture.db.query("INSERT INTO users(id,name,email,password_hash,role,admin_level) VALUES(901,'Teacher','teacher@fixture.test','x','admin',1),(902,'Student','student@fixture.test','x','user',0),(903,'Other teacher','other@fixture.test','x','admin',1)");
  await fixture.db.prepare("INSERT INTO school_teacher_assignments(id,teacher_id,class_code,subject,assignment_type) VALUES('classroom-teacher',901,'10A1','Toán','subject')").run();
  const app=express();app.use(express.json());
  const calls=[],participantsByRoom=new Map();
  installClassroomAccess(app,{db:fixture.db,requireSameOrigin:(req,res,next)=>next(),requireAuth:async(req,res,next)=>{req.user=await fixture.db.prepare('SELECT * FROM users WHERE id=?').get(Number(req.headers['x-user']));next();},notifyAdmins:async()=>{},notifyUser:async()=>{},roomService:{createRoom:async r=>{calls.push(['open',r.name]);participantsByRoom.set(r.name,[]);},deleteRoom:async name=>{calls.push(['close',name]);participantsByRoom.delete(name);},listParticipants:async name=>participantsByRoom.get(name)||[]}});
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const url=`http://127.0.0.1:${server.address().port}/api/classroom-access`;
  const call=(path,user=901,body)=>fetch(url+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-user':String(user)},...(body?{body:JSON.stringify(body)}:{})});
  await call('',902);
  assert.equal((await call('/rooms/10A1/session',902)).status,200);
  assert.equal((await call('/rooms/10A2',903)).status,200);
  assert.equal((await call('/rooms/10A2',902)).status,200);
  assert.equal((await call('/admin/rooms',902)).status,403);
  assert.equal((await call('/admin/rooms',901)).status,403);
  await fixture.db.prepare("INSERT INTO classroom_join_requests(student_id,class_code,status) VALUES(902,'10A1','approved')").run();
  assert.equal((await call('/rooms/10A1/open',902,{})).status,403);
  const opened=await (await call('/rooms/10A1/session',902)).json();
  assert.equal(opened.open,true);assert.equal(opened.admission,'approved');
  const token=await (await call('/rooms/10A1/connect',902,{})).json();assert.ok(token.token);
  const payload=JSON.parse(Buffer.from(token.token.split('.')[1],'base64url'));assert.equal(payload.video.room,`maihoc-session-${opened.meetingId}`);
  participantsByRoom.set(payload.video.room,[{identity:'902',permission:{hidden:false}},{identity:'observer',permission:{hidden:true}}]);
  const lobby=await (await call('',902)).json();assert.equal(lobby.rooms.find(room=>room.class_code==='10A1').participant_count,1);
  assert.equal((await call('/rooms/10A1/close',902,{})).status,403);
  assert.equal((await call('/rooms/10A1/close',901,{})).status,200);
  const reopened=await (await call('/rooms/10A1/connect',902,{})).json();assert.notEqual(reopened.meetingId,opened.meetingId);
  assert.ok(reopened.token);
  assert.ok(calls.some(c=>c[0]==='close'));
 }finally{if(server)await new Promise(r=>server.close(r));process.env=env;await fixture.close();}
});
