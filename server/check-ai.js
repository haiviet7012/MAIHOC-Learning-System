// Run in the backend environment. No key, prefix, hash, prompt or raw provider error is printed.
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { geminiConfig, providerError, aiError, configValue } from './ai-provider.js';
import { literatureConfig } from './grading/literature-provider.js';
import { createLiteratureGenerator } from './grading/literature-ai.js';

export async function checkAi({ env = process.env, fetcher = fetch, live = false, generate = false } = {}) {
  const results = [], cache = new Map();
  const literatureProvider = configValue(env.LITERATURE_AI_PROVIDER).toLowerCase();
  for (const scope of ['shared', 'advisor', 'exam',
    ...(env.LITERATURE_AI_API_KEY || env.LITERATURE_AI_MODEL || (literatureProvider && literatureProvider !== 'gemini') ? ['literature'] : []),
    ...(env.MAIHOC_SCHOOL_UPGRADE_ENABLED === '1' ? ['room', 'document'] : [])]) {
    let config;
    try {
      config = scope === 'literature' ? literatureConfig(env) : geminiConfig(scope, env);
      const result = { scope, keySource: config.keySource, modelSource: config.modelSource, model: config.model, status: 'CONFIGURED_NOT_VERIFIED' };
      if (config.provider === 'nvidia') {
        result.provider = 'nvidia';
        if (generate) {
          const answer = await createLiteratureGenerator({ env, fetcher })({
            instruction: 'Chỉ trả JSON {"ok":true}.', data: { diagnostic: true }
          });
          if (answer.ok !== true) throw aiError('AI_RESPONSE_INVALID', 'NVIDIA chưa trả JSON hợp lệ cho yêu cầu kiểm tra.', 502);
          result.status = 'GENERATE_VERIFIED';
        } else if (live) {
          result.status = 'NVIDIA_GENERATE_CHECK_REQUIRED';
          result.message = 'Dùng --generate để xác minh kết nối NVIDIA bằng yêu cầu JSON nhỏ.';
        }
        results.push(result);
        continue;
      }
      if (live || generate) {
        // Distinct keys may belong to different projects. Never cache by model alone.
        let models = cache.get(config.apiKey);
        if (!models) {
          models = [];
          let next = '';
          do {
            const query = new URLSearchParams({ pageSize: '1000', ...(next ? { pageToken: next } : {}) });
            const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models?${query}`, {
              headers: { 'x-goog-api-key': config.apiKey }, signal: AbortSignal.timeout(15000)
            });
            const data = await response.json();
            if (!response.ok) throw providerError({ status: response.status, error: data.error });
            models.push(...(data.models || []));
            next = data.nextPageToken || '';
          } while (next);
          cache.set(config.apiKey, models);
        }
        const available = models.filter(m => m.supportedGenerationMethods?.includes('generateContent')).map(m => m.name.replace(/^models\//,''));
        if (!available.includes(config.model)) throw aiError('AI_MODEL_UNAVAILABLE', 'Model đã cấu hình không nằm trong danh sách generateContent của key này.');
        result.status = 'AUTH_AND_MODEL_VERIFIED';
        if (generate) {
          const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`, {
            method: 'POST', signal: AbortSignal.timeout(45000),
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
            body: JSON.stringify({ contents: [{ role:'user', parts:[{text:'Trả lời một từ: OK'}] }], generationConfig:{maxOutputTokens:256} })
          });
          const data = await response.json();
          if (!response.ok) throw providerError({ status:response.status, error:data.error });
          if (!data.candidates?.[0]?.content?.parts?.some(p => !p.thought && p.text?.trim())) throw aiError('AI_RESPONSE_INVALID', 'Model chưa trả về nội dung cho yêu cầu kiểm tra.',502);
          result.status = 'GENERATE_VERIFIED';
        }
      }
      results.push(result);
    } catch (error) {
      const safe = providerError(error);
      results.push({ scope, ...(config ? {keySource:config.keySource,modelSource:config.modelSource,model:config.model} : {}), status:safe.code, message:safe.message });
    }
  }
  return results;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({path:path.join(dir,'.env')});
  dotenv.config({path:path.resolve(dir,'..','.env')});
  const results = await checkAi({ live:process.argv.includes('--live'), generate:process.argv.includes('--generate') });
  console.log(JSON.stringify(results,null,2));
  if (results.some(r => r.status.startsWith('AI_'))) process.exitCode = 1;
}
