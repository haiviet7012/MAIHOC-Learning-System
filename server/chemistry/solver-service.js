import { geminiConfig, geminiClient, canTryAnotherModel, providerError } from '../ai-provider.js';
import { geminiModels } from '../ai-models.js';
/**
 * server/chemistry/solver-service.js
 * Dịch vụ xử lý giải bài tập Hóa học với Google Gemini AI
 */

import { SchemaType } from "@google/generative-ai";

const CHEMISTRY_SYSTEM_PROMPT = `
Bạn là một Chuyên gia Giảng dạy và Giải bài tập Hóa học THPT hàng đầu tại Việt Nam, nắm vững chương trình Giáo dục Phổ thông hiện hành (lớp 10, 11, 12).
Nhiệm vụ của bạn là giải bài tập Hóa học một cách chặt chẽ, chính xác tuyệt đối về bản chất hóa học, bảo toàn nguyên tố, bảo toàn electron, bảo toàn khối lượng và điện tích.

QUY TẮC BẮT BUỘC:
1. Quy chuẩn điều kiện khí:
   - Theo chương trình mới (SGK mới): Điều kiện chuẩn (đkc) là 25 °C, 1 bar -> 1 mol khí chiếm 24.79 lít (V = n * 24.79).
   - Nếu đề bài ghi rõ "đktc" (0 °C, 1 atm): 1 mol khí chiếm 22.4 lít (V = n * 22.4). Nếu đề không nói rõ, hãy ưu tiên 24.79 lít và chú thích rõ giả thiết.
2. Phương trình phản ứng: Phải ghi rõ trạng thái (rắn, lỏng, khí, dung dịch nếu cần), điều kiện phản ứng (nhiệt độ, xúc tác) và cân bằng đúng hệ số nguyên tối giản.
3. Thay số và đơn vị: Mọi bước tính toán đều phải ghi rõ công thức, thay số và kết quả kèm đơn vị. Tất cả công thức, số mũ/chỉ số, phân số, phương trình hóa học và biểu thức vật lý phải dùng LaTeX: \\( ... \\) trong dòng và \\[ ... \\] riêng dòng; không dùng ký tự Unicode dạng chỉ số thay thế như H₂O hoặc x².
4. Phân tích đề bài thiếu dữ kiện: Nếu đề thiếu điều kiện hoặc có nhiều cách hiểu, hãy nêu rõ các trường hợp hoặc giả thiết hợp lý nhất.
5. Cấu trúc phản hồi: Bắt buộc trả về định dạng JSON hợp lệ theo đúng cấu trúc schema được yêu cầu. Không thêm bất kỳ văn bản ngoài JSON.
`;

const chemistrySolutionSchema = {
  type: SchemaType.OBJECT,
  properties: {
    summary: {
      type: SchemaType.OBJECT,
      properties: {
        given: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        requirements: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        standardConditionsUsed: { type: SchemaType.STRING }
      },
      required: ["given", "requirements"]
    },
    methodology: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING }
    },
    equations: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          equation: { type: SchemaType.STRING },
          condition: { type: SchemaType.STRING },
          type: { type: SchemaType.STRING }
        },
        required: ["equation"]
      }
    },
    steps: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          stepNumber: { type: SchemaType.NUMBER },
          title: { type: SchemaType.STRING },
          explanation: { type: SchemaType.STRING },
          calculation: { type: SchemaType.STRING },
          resultWithUnit: { type: SchemaType.STRING }
        },
        required: ["stepNumber", "title", "explanation"]
      }
    },
    finalAnswer: {
      type: SchemaType.OBJECT,
      properties: {
        value: { type: SchemaType.STRING },
        highlight: { type: SchemaType.STRING }
      },
      required: ["value"]
    },
    sanityCheck: {
      type: SchemaType.OBJECT,
      properties: {
        limitingReactantAnalysis: { type: SchemaType.STRING },
        conservationVerification: { type: SchemaType.STRING },
        notes: { type: SchemaType.STRING }
      }
    },
    deepDive: {
      type: SchemaType.OBJECT,
      properties: {
        chemicalInsight: { type: SchemaType.STRING },
        similarProblem: { type: SchemaType.STRING }
      }
    }
  },
  required: ["summary", "steps", "finalAnswer"]
};

export async function solveChemistryProblem({ prompt, image, grade, mode, topic }) {
  const { apiKey } = geminiConfig();

  const genAI = geminiClient(apiKey);
  const configuredModels = geminiModels();

  const contents = [];

  // Multimodal: Nếu học sinh gửi ảnh đề thi
  if (image && image.data && image.mimeType) {
    contents.push({
      inlineData: {
        mimeType: image.mimeType,
        data: image.data
      }
    });
  }

  const userInstruction = `
[YÊU CẦU GIẢI BÀI TẬP HÓA HỌC]
- Khối lớp: ${grade === "all" ? "Tự động nhận diện" : `Lớp ${grade}`}
- Chế độ hiển thị: ${mode === "hint" ? "Gợi ý phương pháp & công thức" : mode === "concise" ? "Giải vắn tắt & đáp số" : "Giải chi tiết từng bước đầy đủ"}
- Chủ đề: ${topic || "Tự động xác định"}

ĐỀ BÀI CẦN GIẢI:
${prompt || "(Xem đề bài trong hình ảnh đính kèm)"}
`;

  contents.push({ text: userInstruction });

  const tryModels = configuredModels;

  let lastError = null;

  for (const modelName of tryModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: CHEMISTRY_SYSTEM_PROMPT,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: chemistrySolutionSchema,
          temperature: 0.2
        }
      });

      const result = await model.generateContent({
        contents: [{ role: "user", parts: contents }]
      });

      const responseText = result.response.text();
      const cleanJson = responseText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const parsedSolution = JSON.parse(cleanJson);
      parsedSolution.modelUsed = modelName;
      parsedSolution.solvedAt = new Date().toISOString();

      return parsedSolution;
    } catch (err) {
      console.warn(`[Chemistry Solver] Model ${modelName} gặp lỗi:`, providerError(err).code);
      lastError = providerError(err);
      const isQuota = /quota|429|resource_exhausted/i.test(err.message || "");
      if (isQuota || !canTryAnotherModel(lastError)) break; // If quota is exhausted on the API key, trying next model on the same key might still hit quota, but let's check
    }
  }

  const isQuota = /quota|429|resource_exhausted/i.test(lastError?.message || "");
  if (isQuota) {
    const quotaErr = new Error("Hạn ngạch AI Gemini hiện đang bận hoặc vượt giới hạn. Vui lòng thử lại sau ít phút.");
    quotaErr.code = "AI_QUOTA_EXHAUSTED";
    quotaErr.status = 429;
    throw quotaErr;
  }

  throw lastError || new Error("Không thể xử lý bài tập lúc này.");
}

