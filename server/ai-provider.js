import { GoogleGenerativeAI } from '@google/generative-ai';

export function configValue(value) {
  const text = String(value ?? '').trim();
  return text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))
    ? text.slice(1, -1).trim() : text;
}
function first(env, names) {
  for (const name of names) {
    const value = configValue(env[name]);
    if (value) return { value, source: name };
  }
  return { value: '', source: names[0] };
}
export function aiError(code, message, status = 503, retryable = false) {
  return Object.assign(new Error(message), { code, status, retryable, safeAiError: true });
}
export function normalizeModel(value) {
  const model = configValue(value).replace(/^models\//, '');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(model)) {
    throw aiError('AI_MODEL_MISSING', 'Chưa cấu hình model Gemini hợp lệ trên backend.');
  }
  return model;
}
export function geminiConfig(scope = 'shared', env = process.env) {
  const key = first(env, scope === 'advisor'
    ? ['LEARNING_ADVISOR_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY']
    : scope === 'exam' ? ['GEMINI_SOLUTION_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY']
    : ['GEMINI_API_KEY', 'GOOGLE_API_KEY']);
  const model = first(env, scope === 'advisor' ? ['LEARNING_ADVISOR_MODEL', 'GEMINI_MODEL']
    : scope === 'exam' ? ['GEMINI_SOLUTION_MODEL', 'GEMINI_MODEL'] : ['GEMINI_MODEL']);
  if (!key.value) throw aiError('AI_KEY_MISSING', 'Chưa cấu hình API key Gemini trên backend.');
  // Do not restrict key prefixes: both standard and authorization keys are supported.
  if (/\s/.test(key.value)) throw aiError('AI_KEY_FORMAT', 'API key Gemini trên backend chứa khoảng trắng hoặc xuống dòng. Hãy sao chép lại đầy đủ key.');
  return { apiKey: key.value, keySource: key.source, model: normalizeModel(model.value), modelSource: model.source };
}
export function geminiConfigured(scope = 'shared', env = process.env) {
  try { geminiConfig(scope, env); return true; } catch { return false; }
}
export function providerError(error) {
  if (error?.safeAiError) return error;
  const status = Number(error?.status || error?.statusCode || error?.error?.code || 0);
  const detail = `${error?.message || ''} ${JSON.stringify(error?.errorDetails || error?.error?.details || [])}`;
  if (status === 401 || /API_KEY_INVALID|ACCESS_TOKEN_TYPE_UNSUPPORTED|API key not valid|UNAUTHENTICATED|API_KEY_EXPIRED|API key expired/i.test(detail))
    return aiError('AI_AUTH_INVALID', 'Google từ chối API key Gemini. Quản trị viên cần kiểm tra key, project và cấu hình xác thực trên backend.');
  if (status === 403 || /PERMISSION_DENIED|API_KEY_SERVICE_BLOCKED|API_KEY_HTTP_REFERRER_BLOCKED/i.test(detail))
    return aiError('AI_PERMISSION_DENIED', 'API key/project chưa có quyền gọi Gemini. Quản trị viên cần kiểm tra API restrictions và quyền của project.');
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(detail))
    return aiError('AI_QUOTA_EXHAUSTED', 'Hạn ngạch Gemini đã đạt giới hạn. Hãy thử lại sau hoặc kiểm tra quota của project.', 429);
  if (status === 404 || /model.*not found|not found.*model/i.test(detail))
    return aiError('AI_MODEL_UNAVAILABLE', 'Model Gemini không tồn tại hoặc key chưa được phép dùng model này. Hãy kiểm tra model trên backend.');
  if (status === 400)
    return aiError('AI_REQUEST_INVALID', 'Gemini không chấp nhận yêu cầu hoặc tham số của model. Hãy kiểm tra cấu hình backend.', 502);
  if (status >= 500 || /fetch failed|network|timeout|timed out|aborted|ECONN|ENOTFOUND/i.test(detail))
    return aiError('AI_PROVIDER_UNAVAILABLE', 'Kết nối Gemini gián đoạn hoặc dịch vụ đang quá tải. Hãy thử lại sau.', 503, true);
  return aiError('AI_RESPONSE_INVALID', 'Chưa nhận được phản hồi hợp lệ từ Gemini. Hãy thử lại.', 502);
}
export function canTryAnotherModel(error) {
  return error?.retryable === true || error?.code === 'AI_MODEL_UNAVAILABLE';
}
// All SDK consumers use the same key normalization, bounded timeout and safe errors.
export function geminiClient(apiKey) {
  const key = configValue(apiKey);
  const client = new GoogleGenerativeAI(key);
  return {
    getGenerativeModel(options) {
      const model = client.getGenerativeModel({ ...options, model: normalizeModel(options.model) });
      return {
        async generateContent(request) {
          try { return await model.generateContent(request, { signal: AbortSignal.timeout(45000) }); }
          catch (error) { throw providerError(error); }
        }
      };
    }
  };
}
