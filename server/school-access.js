import { canAccessSchool } from '../js/platform/school-access.js';

const schoolPaths = ['/api/school', '/api/platform', '/api/tests', '/api/test-submissions', '/api/learning/timetable'];
export function schoolAccessGuard(req, res, next) {
  const path = req.path.replace(/\/+$/, '');
  // Context is also queried by the Learning solver; return no School data there.
  if (path === '/api/platform/context' && req.method === 'GET') return next();
  // Background tutor jobs belong to Learning, although their URL uses platform.
  if (/^\/api\/platform\/ai\/jobs(?:\/[^/]+)?$/.test(path)) return next();
  const schoolRequest = schoolPaths.some(prefix => path === prefix || path.startsWith(prefix + '/')) ||
    (path.startsWith('/api/learning-advisor') && req.query.scope === 'school') ||
    (path === '/api/progress' && req.method === 'PUT' && String(req.body?.itemType ?? '') === 'test');
  if (!schoolRequest || canAccessSchool(req.user)) return next();
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(req.user ? 403 : 401).json({
    error: 'MAIHOC School chỉ dành cho học sinh trong trường và giáo viên.',
    code: 'SCHOOL_ACCESS_REQUIRED',
  });
}
