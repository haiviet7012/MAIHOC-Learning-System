export async function ensureLearningSchema(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS learning_timetables (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    cells JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
}

export const TIMETABLE_SUBJECTS = ['Toán', 'Ngữ văn', 'Tiếng Anh', 'Vật lý', 'Hóa học', 'Sinh học', 'Lịch sử', 'Địa lý', 'Tin học', 'Giáo dục kinh tế và pháp luật', 'Công nghệ', 'IELTS', 'Tự học'];
export function validateTimetable(body) {
  if (!Number.isSafeInteger(body?.version) || body.version < 0) throw new Error('Phiên bản lịch không hợp lệ.');
  const cells = body?.cells;
  if (!cells || typeof cells !== 'object' || Array.isArray(cells) || Object.keys(cells).length > 28) throw new Error('Thời khóa biểu không hợp lệ.');
  for (const [key, value] of Object.entries(cells)) {
    if (!/^[0-3]-[0-6]$/.test(key) || !TIMETABLE_SUBJECTS.includes(value)) throw new Error('Ô hoặc môn học không hợp lệ.');
  }
  return { cells, version: body.version };
}

export function installLearningRoutes(app, { db, requireAuth, requireSameOrigin }) {
  app.get('/api/learning/timetable', requireAuth, async (req, res, next) => {
    try {
      const result = await db.query('SELECT cells,version,updated_at FROM learning_timetables WHERE user_id=$1', [req.user.id]);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ timetable: result.rows[0] || null });
    } catch (error) { next(error); }
  });
  app.put('/api/learning/timetable', requireSameOrigin, requireAuth, async (req, res, next) => {
    let data;
    try { data = validateTimetable(req.body); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    try {
      const result = data.version === 0
        ? await db.query(`INSERT INTO learning_timetables(user_id,cells) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO NOTHING RETURNING cells,version,updated_at`, [req.user.id, JSON.stringify(data.cells)])
        : await db.query(`UPDATE learning_timetables SET cells=$2::jsonb,version=version+1,updated_at=now() WHERE user_id=$1 AND version=$3 RETURNING cells,version,updated_at`, [req.user.id, JSON.stringify(data.cells), data.version]);
      if (!result.rows[0]) return res.status(409).json({ error: 'Lịch đã được thay đổi ở nơi khác. Hãy tải lại trước khi sửa.' });
      res.json({ timetable: result.rows[0] });
    } catch (error) { next(error); }
  });
}
