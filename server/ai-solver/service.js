import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const SUBJECT_GUIDANCE = {
  "Toán": "Giải toán chính xác; nêu công thức, lập luận và kiểm tra kết quả.",
  "Tiếng Anh": "Giải thích ngữ pháp, từ vựng và lý do chọn đáp án bằng tiếng Việt; minh họa câu tiếng Anh khi cần.",
  "Vật lý": "Xác định đại lượng, đơn vị, công thức vật lý, đổi đơn vị, thế số và kiểm tra tính hợp lý.",
  "Hóa học": "Cân bằng phương trình, bảo toàn nguyên tố/điện tích, nêu điều kiện phản ứng và đơn vị. Phân biệt đkc 24,79 L/mol và đktc 22,4 L/mol theo đề.",
  "Ngữ văn": "Phân tích văn bản dựa trên bằng chứng; với bài viết, trình bày luận điểm, lập luận và dẫn chứng phù hợp, không bịa trích dẫn.",
  "Sinh học": "Dùng thuật ngữ sinh học chính xác, giải thích cơ chế, quan hệ nhân quả và các bước suy luận.",
  "Đề thi THPT quốc gia": "Xác định môn học từ nội dung đề; giải lần lượt từng câu, ghi rõ đáp án và lý giải.",
  "IELTS": "Hỗ trợ IELTS bằng tiếng Việt; giải thích đáp án, ngữ pháp, từ vựng và chiến lược làm bài theo kỹ năng."
};

async function extractPdfText(file) {
  const data = Buffer.from(file.data, "base64");
  if (data.length > 8 * 1024 * 1024) {
    const error = new Error("PDF vượt quá dung lượng 8 MB.");
    error.status = 413;
    throw error;
  }
  const pdf = await getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
    isEvalSupported: false
  }).promise;
  try {
    if (pdf.numPages > 80) {
      const error = new Error("PDF có quá 80 trang. Vui lòng tách tệp và thử lại.");
      error.status = 413;
      throw error;
    }
    const pages = [];
    let totalLength = 0;
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const text = content.items.map(item => item.str || "").join(" ");
      totalLength += text.length;
      if (totalLength > 28000) {
        pages.push("[Đã lược bớt phần còn lại vì giới hạn độ dài xử lý.]");
        break;
      }
      pages.push(`[Trang ${pageNo}]\n${text}`);
    }
    const extracted = pages.join("\n\n").trim();
    if (!extracted) {
      const error = new Error("PDF không có lớp văn bản để trích xuất (có thể là PDF scan). Hãy tải ảnh trang đề hoặc dùng PDF có văn bản.");
      error.status = 422;
      throw error;
    }
    return extracted;
  } finally {
    await pdf.destroy();
  }
}

export async function solveUniversalProblem({ prompt, subject, mode, image, file }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error("Chưa cấu hình GEMINI_API_KEY trong file server/.env.");
    error.code = "MISSING_API_KEY";
    error.status = 503;
    throw error;
  }

  let problemText = prompt || "";
  if (file) {
    const pdfText = await extractPdfText(file);
    problemText = [problemText, `NỘI DUNG TRÍCH XUẤT TỪ PDF (${file.name}):\n${pdfText}`].filter(Boolean).join("\n\n");
  }
  if (problemText.length > 28000) problemText = problemText.slice(0, 28000);

  const instruction = [
    "Bạn là trợ lý học tập MAI HỌC, giải bài tập phổ thông chính xác, rõ ràng và trung thực.",
    `MÔN HỌC: ${subject}`,
    `HƯỚNG DẪN CHUYÊN MÔN: ${SUBJECT_GUIDANCE[subject]}`,
    `CHẾ ĐỘ: ${mode === "quick" ? "GIẢI NHANH: nêu phương pháp cốt lõi và đáp án, giữ các bước thiết yếu để kiểm chứng." : "GIẢI CHI TIẾT: phân tích dữ kiện, giải từng bước, giải thích tại sao dùng phương pháp đó và kiểm tra kết quả."}`,
    "Quy tắc: Không bịa dữ kiện. Nếu ảnh/PDF mờ hoặc thiếu nội dung, nói rõ phần không đọc được. Nếu đề có nhiều câu, giữ số thứ tự và giải từng câu. Dùng Markdown dễ đọc, công thức LaTeX khi phù hợp. Với câu trắc nghiệm phải ghi đáp án và giải thích ngắn. Không thêm lời chào dài dòng.",
    image ? "Đọc cả nội dung trong ảnh đính kèm." : "",
    "ĐỀ BÀI:",
    problemText || "(Đề bài được cung cấp trong tệp/ảnh đính kèm.)"
  ].filter(Boolean).join("\n\n");

  const genAI = new GoogleGenerativeAI(apiKey);
  const preferred = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const models = [...new Set([preferred, "gemini-3.6-flash", "gemini-3.8-flash", "gemini-3.5-flash"])];
  let lastError;
  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { temperature: 0.2 }
      });
      const parts = [];
      if (image?.data) {
        parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
      }
      parts.push({ text: instruction });
      const result = await model.generateContent({ contents: [{ role: "user", parts }] });
      return {
        answer: result.response.text(),
        modelUsed: modelName,
        subject,
        mode,
        solvedAt: new Date().toISOString(),
        source: file ? "pdf" : image ? "image" : "text"
      };
    } catch (error) {
      lastError = error;
      if (/quota|429|resource_exhausted/i.test(error.message || "")) break;
      console.warn(`[Universal AI Solver] ${modelName} failed:`, error.message || error);
    }
  }
  if (/quota|429|resource_exhausted/i.test(lastError?.message || "")) {
    const error = new Error("Hạn ngạch AI Gemini đang bận hoặc đã hết. Vui lòng thử lại sau.");
    error.status = 429;
    throw error;
  }
  throw lastError || new Error("Không thể giải bài lúc này.");
}
