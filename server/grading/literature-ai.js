// Uses the existing backend-only Gemini configuration and bounded provider timeout.
export function createLiteratureGenerator({ apiKey, modelName } = {}) {
  return async ({ instruction, data }) => {
    const { geminiConfig, geminiClient } = await import("../ai-provider.js");
    const config = apiKey && modelName ? { apiKey, model: modelName } : geminiConfig("exam");
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
