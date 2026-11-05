import { aiError, configValue, geminiConfig } from "../ai-provider.js";

const nvidiaBaseUrl = "https://integrate.api.nvidia.com/v1";
function integerSetting(value, fallback, min, max, name) {
  const raw = configValue(value);
  const number = raw ? Number(raw) : fallback;
  if (!Number.isInteger(number) || number < min || number > max) {
    throw aiError("AI_CONFIG_INVALID", `${name} phải là số nguyên từ ${min} đến ${max}.`);
  }
  return number;
}

export function literatureConfig(env = process.env) {
  const provider = (configValue(env.LITERATURE_AI_PROVIDER) || "gemini").toLowerCase();
  if (provider === "gemini") return { provider, ...geminiConfig("literature", env) };
  if (provider !== "nvidia") throw aiError("AI_PROVIDER_UNSUPPORTED", "LITERATURE_AI_PROVIDER chỉ nhận gemini hoặc nvidia.");
  const apiKey = configValue(env.LITERATURE_AI_API_KEY);
  if (!apiKey) throw aiError("AI_KEY_MISSING", "Chưa cấu hình LITERATURE_AI_API_KEY trên backend.");
  if (/\s/.test(apiKey)) throw aiError("AI_KEY_FORMAT", "API key NVIDIA chứa khoảng trắng.");
  const model = configValue(env.LITERATURE_AI_MODEL);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(model) || model.length > 200) {
    throw aiError("AI_MODEL_MISSING", "LITERATURE_AI_MODEL cần ID dạng namespace/model trong NVIDIA API Catalog.");
  }
  let url;
  try { url = new URL(configValue(env.LITERATURE_AI_BASE_URL) || nvidiaBaseUrl); }
  catch { throw aiError("AI_BASE_URL_INVALID", "LITERATURE_AI_BASE_URL không hợp lệ."); }
  // NVIDIA-hosted NIM only. Never send credentials to arbitrary hosts or follow redirects.
  if (url.protocol !== "https:" || url.hostname !== "integrate.api.nvidia.com" || url.port
    || url.username || url.password || url.search || url.hash || !/^\/v1\/?$/.test(url.pathname)) {
    throw aiError("AI_BASE_URL_INVALID", "NVIDIA cloud cần base URL https://integrate.api.nvidia.com/v1.");
  }
  return {
    provider, apiKey, model, keySource: "LITERATURE_AI_API_KEY", modelSource: "LITERATURE_AI_MODEL",
    baseUrl: nvidiaBaseUrl,
    maxTokens: integerSetting(env.LITERATURE_AI_MAX_TOKENS, 4096, 256, 32768, "LITERATURE_AI_MAX_TOKENS"),
    timeoutMs: integerSetting(env.LITERATURE_AI_TIMEOUT_MS, 45000, 1000, 180000, "LITERATURE_AI_TIMEOUT_MS")
  };
}
