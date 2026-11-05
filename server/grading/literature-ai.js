import { aiError, geminiClient } from "../ai-provider.js";
import { literatureConfig } from "./literature-provider.js";

async function nvidiaGenerate(config, { instruction, data }, fetcher) {
  let response;
  try {
    response = await fetcher(`${config.baseUrl}/chat/completions`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(config.timeoutMs),
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, stream: false, temperature: 0, max_tokens: config.maxTokens,
        messages: [{ role: "system", content: instruction }, { role: "user", content: JSON.stringify(data) }] })
    });
  } catch {
    throw aiError("AI_PROVIDER_UNAVAILABLE", "Kết nối NVIDIA gián đoạn hoặc hết thời gian chờ.", 503, true);
  }
  if (response.status === 202) throw aiError("AI_PROVIDER_PENDING", "NVIDIA chưa trả kết quả hoàn chỉnh; cần chấm lại.", 503, true);
  if (!response.ok) {
    if (response.status === 401) throw aiError("AI_AUTH_INVALID", "NVIDIA từ chối API key. Quản trị viên cần kiểm tra cấu hình.");
    if (response.status === 403) throw aiError("AI_PERMISSION_DENIED", "API key chưa có quyền gọi model NVIDIA này.");
    if (response.status === 429) throw aiError("AI_QUOTA_EXHAUSTED", "Hạn ngạch NVIDIA đã đạt giới hạn.", 429);
    if (response.status >= 500) throw aiError("AI_PROVIDER_UNAVAILABLE", "Dịch vụ NVIDIA tạm thời chưa sẵn sàng.", 503, true);
    throw aiError("AI_REQUEST_INVALID", "NVIDIA không chấp nhận model hoặc tham số của yêu cầu.", 502);
  }
  try {
    const payload = await response.json();
    const choice = payload.choices?.[0];
    if (choice?.finish_reason !== "stop") throw new Error("Incomplete response");
    const content = choice.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("Missing content");
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid object");
    return parsed;
  } catch {
    throw aiError("AI_RESPONSE_INVALID", "NVIDIA chưa trả JSON hoàn chỉnh để chấm Văn. Cần chấm lại.", 502);
  }
}

// Dedicated Literature credentials for both providers; never borrow shared/exam-solving keys.
export function createLiteratureGenerator({ apiKey, modelName, provider, baseUrl, maxTokens, timeoutMs,
  env = process.env, fetcher = fetch } = {}) {
  return async ({ instruction, data }) => {
    const hasCredentials = apiKey !== undefined || modelName !== undefined;
    if (hasCredentials && !(apiKey && modelName)) {
      throw aiError("AI_CONFIG_INCOMPLETE", "Cần cấu hình đủ API key và model riêng cho Ngữ văn.");
    }
    const config = literatureConfig({ ...env,
      ...(hasCredentials ? { LITERATURE_AI_API_KEY: apiKey, LITERATURE_AI_MODEL: modelName,
        LITERATURE_AI_PROVIDER: provider ?? "gemini" } : {}),
      ...(provider !== undefined ? { LITERATURE_AI_PROVIDER: provider } : {}),
      ...(baseUrl !== undefined ? { LITERATURE_AI_BASE_URL: baseUrl } : {}),
      ...(maxTokens !== undefined ? { LITERATURE_AI_MAX_TOKENS: maxTokens } : {}),
      ...(timeoutMs !== undefined ? { LITERATURE_AI_TIMEOUT_MS: timeoutMs } : {})
    });
    if (config.provider === "nvidia") return nvidiaGenerate(config, { instruction, data }, fetcher);
    const model = geminiClient(config.apiKey).getGenerativeModel({
      model: config.model, systemInstruction: instruction,
      generationConfig: { temperature: 0, responseMimeType: "application/json" }
    });
    const result = await model.generateContent({ contents: [{ role: "user", parts: [{ text: JSON.stringify(data) }] }] });
    return JSON.parse(result.response.text());
  };
}
