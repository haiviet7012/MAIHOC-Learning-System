// Dedicated Literature credentials; never fall back to the shared or exam-solving key.
export function createLiteratureGenerator({ apiKey, modelName } = {}) {
  return async ({ instruction, data }) => {
    const { geminiConfig, geminiClient, aiError } = await import("../ai-provider.js");
    if ((apiKey !== undefined || modelName !== undefined) && !(apiKey && modelName)) {
      throw aiError("AI_CONFIG_INCOMPLETE", "Cần cấu hình đủ API key và model riêng cho Ngữ văn.");
    }
    const config = apiKey && modelName ? { apiKey, model: modelName } : geminiConfig("literature");
    const model = geminiClient(config.apiKey).getGenerativeModel({
      model: config.model,
      systemInstruction: instruction,
      generationConfig: { temperature: 0, responseMimeType: "application/json" }
    });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: JSON.stringify(data) }] }]
    });
    return JSON.parse(result.response.text());
  };
}
