import test from 'node:test';
import assert from 'node:assert/strict';
import { testDatabase } from '../platform/test-db.js';
import { purgeExpiredChatMessages } from '../chat.js';

test('24-hour retention deletes old global and direct messages, retaining recent messages', async () => {
  const fixture = await testDatabase();
  try {
    await fixture.db.query('CREATE TEMP TABLE chat_messages(id INTEGER PRIMARY KEY, conversation_id TEXT, created_at TEXT)');
    await fixture.db.query(`INSERT INTO chat_messages VALUES
      (1,'global',(NOW()-INTERVAL '25 hours')::text),
      (2,'direct_1_2',(NOW()-INTERVAL '25 hours')::text),
      (3,'global',(NOW()-INTERVAL '23 hours')::text),
      (4,'direct_1_2',(NOW()-INTERVAL '1 hour')::text),
      (5,'global','2026-11-02 10:00:00'),
      (6,'direct_1_2',(((NOW()-INTERVAL '1 hour') AT TIME ZONE 'Asia/Ho_Chi_Minh')::text || '+07'))`);
    await purgeExpiredChatMessages(fixture.db);
    assert.deepEqual((await fixture.db.query('SELECT id FROM chat_messages ORDER BY id')).rows.map(r=>r.id),[3,4,6]);
    await purgeExpiredChatMessages(fixture.db);
    assert.equal((await fixture.db.query('SELECT count(*)::int AS n FROM chat_messages')).rows[0].n,3);
  } finally { await fixture.close(); }
});
