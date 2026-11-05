// Read-only by default; --repair adds missing attachment columns only.
// Never print credentials or message content, or run retention cleanup.
import { db, pool } from '../server/postgres.js';
try {
  if (process.argv.includes('--repair')) {
    const { ensureChatAttachmentSchema } = await import('../server/chat.js');
    await ensureChatAttachmentSchema();
    console.log('Chat attachment columns are ready. Existing messages unchanged.');
  }
  const result = await db.query(
    'SELECT column_name,data_type,column_default,is_identity FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position',
    ['chat_messages']
  );
  console.log(JSON.stringify({ columns: result.rows }));
  const constraints=await db.query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='chat_messages'::regclass");
  console.log(JSON.stringify({constraints:constraints.rows}));
} catch (error) {
  console.error(JSON.stringify({ name: error.name, code: error.code, message: error.message }));
  process.exitCode = 1;
} finally {
  await pool.end();
}
