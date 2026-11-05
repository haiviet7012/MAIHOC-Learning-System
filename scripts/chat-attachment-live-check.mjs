// Exercise the real upload/download handlers with PostgreSQL and R2.
// Test user/messages are rolled back; only our new R2 object is deleted.
// No live Socket.IO clients are attached, so no test message is broadcast.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { db,pool } from '../server/postgres.js';
import { setupChat } from '../server/chat.js';
import { deleteFromR2 } from '../server/r2-storage.js';
const routes=new Map();
const app={use(){},post(path,...handlers){routes.set(`POST ${path}`,handlers.at(-1));},get(path,...handlers){routes.set(`GET ${path}`,handlers.at(-1));}};
const server=createServer();
setupChat(server,app);
const rollback=new Error('ROLLBACK_TEST_ONLY');
const keys=[];
const response=()=>({statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;},set(){return this;},send(body){this.body=body;return this;}});
try{
  await db.transaction(async()=>{
    const token=crypto.randomUUID();
    const user=await db.prepare("INSERT INTO users(name,email,password_hash,role,account_type) VALUES(?,?,?,'user','external') RETURNING id").get('Upload diagnostic',`${token}@diagnostic.invalid`,'unused');
    for(const [name,type,bytes] of [
      ['image.png','image/png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBv0AAAAASUVORK5CYII=','base64')],
      ['file.txt','text/plain',Buffer.from('Chat attachment diagnostic')]
    ]){
      const result=response();
      await routes.get('POST /api/chat/attachments')({user,body:{conversationId:'global',content:''},file:{originalname:name,mimetype:type,buffer:bytes,size:bytes.length}},result);
      if(result.body?.message){
        const row=await db.prepare('SELECT attachment_key FROM chat_messages WHERE id=?').get(result.body.message.id);
        if(row?.attachment_key)keys.push(row.attachment_key);
      }
      assert.equal(result.statusCode,200,JSON.stringify(result.body));
      assert.equal(result.body.message.attachment.name,name);
      const download=response();
      await routes.get('GET /api/chat/messages/:id/attachment')({user,params:{id:String(result.body.message.id)}},download);
      assert.equal(download.statusCode,200,JSON.stringify(download.body));
      assert.deepEqual(download.body,bytes);
      console.log(`PASS: actual PostgreSQL + R2 upload/download (${type})`);
    }
    throw rollback;
  })();
}catch(error){
  if(error!==rollback){console.error(error);process.exitCode=1;}
}finally{
  for(const key of keys)await deleteFromR2(key);
  server.emit('close');
  await pool.end();
  console.log('Diagnostic finished: test database changes rolled back; test uploads removed.');
}
