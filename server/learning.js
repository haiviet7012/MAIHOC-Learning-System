export async function ensureLearningSchema(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS learning_timetables (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    cells JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await db.query("ALTER TABLE learning_timetables ADD COLUMN IF NOT EXISTS layout_version INTEGER NOT NULL DEFAULT 1");
  await db.query("ALTER TABLE learning_timetables ADD COLUMN IF NOT EXISTS legacy_cells JSONB");
}

export const TIMETABLE_SUBJECTS = ['Toán', 'Ngữ văn', 'Tiếng Anh', 'Vật lý', 'Hóa học', 'Sinh học', 'Lịch sử', 'Địa lý', 'Tin học', 'Giáo dục kinh tế và pháp luật', 'Công nghệ', 'IELTS', 'Tự học'];
export function normalizeTimetable(row) {
  if (!row) return null;
  if (row.layout_version === 2) return { ...row, layoutVersion: 2, legacyCells: row.legacy_cells };
  const cells = {};
  for (const [key, value] of Object.entries(row.cells || {})) {
    const [slot, day] = key.split('-');
    if (Number(slot) < 3) cells[`${[0, 1, 5][Number(slot)]}-${day}`] = value;
  }
  return { ...row, cells, layoutVersion: 2, legacyCells: row.cells };
}
export function validateTimetable(body) {
  if (body?.layoutVersion !== 2) throw new Error('Bố cục lịch đã được cập nhật. Hãy tải lại trang trước khi lưu.');
  if (!Number.isSafeInteger(body?.version) || body.version < 0) throw new Error('Phiên bản lịch không hợp lệ.');
  const cells = body?.cells;
  if (!cells || typeof cells !== 'object' || Array.isArray(cells) || Object.keys(cells).length > 63) throw new Error('Thời khóa biểu không hợp lệ.');
  for (const [key, value] of Object.entries(cells)) {
    if (!/^[0-8]-[0-6]$/.test(key) || !TIMETABLE_SUBJECTS.includes(value)) throw new Error('Ô hoặc môn học không hợp lệ.');
  }
  return { cells, version: body.version };
}

export function installLearningRoutes(app, { db, requireAuth, requireSameOrigin }) {
  app.get('/api/learning/timetable', requireAuth, async (req, res, next) => {
    try {
      const result = await db.query('SELECT cells,version,updated_at,layout_version,legacy_cells FROM learning_timetables WHERE user_id=$1', [req.user.id]);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ timetable: normalizeTimetable(result.rows[0]) });
    } catch (error) { next(error); }
  });
  app.put('/api/learning/timetable', requireSameOrigin, requireAuth, async (req, res, next) => {
    let data;
    try { data = validateTimetable(req.body); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    try {
      const result = data.version === 0
        ? await db.query(`INSERT INTO learning_timetables(user_id,cells,layout_version) VALUES($1,$2::jsonb,2) ON CONFLICT(user_id) DO NOTHING RETURNING cells,version,updated_at,layout_version,legacy_cells`, [req.user.id, JSON.stringify(data.cells)])
        : await db.query(`UPDATE learning_timetables SET legacy_cells=CASE WHEN layout_version=1 THEN cells ELSE legacy_cells END,layout_version=2,cells=$2::jsonb,version=version+1,updated_at=now() WHERE user_id=$1 AND version=$3 RETURNING cells,version,updated_at,layout_version,legacy_cells`, [req.user.id, JSON.stringify(data.cells), data.version]);
      if (!result.rows[0]) return res.status(409).json({ error: 'Lịch đã được thay đổi ở nơi khác. Hãy tải lại trước khi sửa.' });
      res.json({ timetable: normalizeTimetable(result.rows[0]) });
    } catch (error) { next(error); }
  });
}
