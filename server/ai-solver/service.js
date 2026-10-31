import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const AUTO_SUBJECT = "Tự nhận diện";
const SUBJECT_NAMES = new Set(["Toán", "Tiếng Anh", "Vật lý", "Hóa học", "Ngữ văn", "Sinh học", "Đề thi THPT quốc gia", "IELTS"]);

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
  if (data.length > 20 * 1024 * 1024) {
    const error = new Error("PDF vượt quá dung lượng 20 MB.");
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
    // Scan-only PDFs are still passed to Gemini as PDF data so its vision capability can read them.
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
    if (pdfText) {
      problemText = [problemText, `NỘI DUNG TRÍCH XUẤT TỪ PDF (${file.name}):\n${pdfText}`].filter(Boolean).join("\n\n");
    } else {
      problemText = [problemText, `Tệp ${file.name} không có lớp văn bản. Hãy đọc trực tiếp từng trang của tệp PDF đính kèm như tài liệu scan.`].filter(Boolean).join("\n\n");
    }
  }
  if (problemText.length > 28000) problemText = problemText.slice(0, 28000);

  const instruction = [
    "Bạn là trợ lý học tập MAI HỌC, giải bài tập phổ thông chính xác, rõ ràng và trung thực.",
    subject === AUTO_SUBJECT
      ? "MÔN HỌC: TỰ NHẬN DIỆN. Trước khi giải, hãy suy luận môn học dựa trên đề bài văn bản, hình ảnh hoặc PDF; không hỏi người dùng chọn môn. Hỗ trợ cả Toán, Tiếng Anh, Vật lý, Hóa học, Ngữ văn, Sinh học, đề thi tổng hợp, IELTS và môn học khác. Nếu là đề liên môn, xác định môn chính và giải các phần liên quan."
      : `MÔN HỌC: ${subject}`,
    subject === AUTO_SUBJECT
      ? "HƯỚNG DẪN: Xác định chính xác môn và chủ đề từ dữ kiện/ký hiệu trong đề. Áp dụng kiến thức chuyên môn tương ứng, giải bằng tiếng Việt (trừ khi đề/ngữ cảnh yêu cầu ngôn ngữ khác), và nêu rõ nếu nội dung không đủ để nhận diện."
      : `HƯỚNG DẪN CHUYÊN MÔN: ${SUBJECT_GUIDANCE[subject]}`,
    ...(subject === AUTO_SUBJECT ? [
      "ĐỊNH DẠNG METADATA: Dòng đầu tiên bắt buộc là [[MAIHOC_SUBJECT: tên môn]], trong đó tên môn phải là một trong: Toán, Tiếng Anh, Vật lý, Hóa học, Ngữ văn, Sinh học, Đề thi THPT quốc gia, IELTS. Dòng này là metadata máy đọc; không lặp lại trong phần lời giải."
    ] : []),
    `CHẾ ĐỘ: ${mode === "quick" ? "GIẢI NHANH: nêu phương pháp cốt lõi và đáp án, giữ các bước thiết yếu để kiểm chứng." : "GIẢI CHI TIẾT: phân tích dữ kiện, giải từng bước, giải thích tại sao dùng phương pháp đó và kiểm tra kết quả."}`,
    "Quy tắc: Không bịa dữ kiện. Nếu ảnh/PDF mờ hoặc thiếu nội dung, nói rõ phần không đọc được. Nếu đề có nhiều câu, giữ số thứ tự và giải từng câu. Dùng Markdown dễ đọc. MỌI biểu thức toán học, phân số, số mũ/chỉ số, vector, đơn vị có ký hiệu, phương trình hóa học và công thức vật lý phải viết bằng LaTeX; dùng \\( ... \\) cho công thức trong dòng và \\[ ... \\] cho công thức riêng dòng. Hóa học dùng \\mathrm{H_2O}, \\rightarrow, \\ce{} chỉ khi MathJax mhchem được bật (ưu tiên công thức chỉ số thông thường nếu không). Tránh dùng Unicode ký hiệu làm thay thế công thức như x², H₂O, ->, <=. Với câu trắc nghiệm phải ghi đáp án và giải thích ngắn. Không thêm lời chào dài dòng.",
    image ? "Đọc cả nội dung trong ảnh đính kèm." : "",
    "ĐỀ BÀI:",
    problemText || "(Đề bài được cung cấp trong tệp/ảnh đính kèm.)"
  ].filter(Boolean).join("\n\n");

  const genAI = new GoogleGenerativeAI(apiKey);
  const configuredModel = String(process.env.GEMINI_MODEL || "").trim();
  const preferred = configuredModel || "gemini-2.5-flash";
  // Respect an explicit Render override; otherwise use the known project fallback.
  const models = configuredModel
    ? [preferred]
    : ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"];
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
      if (file?.data) {
        // Attach the PDF itself as multimodal input as well as extracted text, enabling scan-only PDFs.
        parts.push({ inlineData: { mimeType: "application/pdf", data: file.data } });
      }
      parts.push({ text: instruction });
      const result = await model.generateContent({ contents: [{ role: "user", parts }] });
      const rawAnswer = result.response.text();
      const subjectMarker = rawAnswer.match(/^\s*\[\[MAIHOC_SUBJECT:\s*([^\]\r\n]{1,80})\]\]\s*/i);
      const markedSubject = subjectMarker?.[1]?.trim();
      const answer = subjectMarker ? rawAnswer.slice(subjectMarker[0].length).trimStart() : rawAnswer;
      const detectedSubject = markedSubject && SUBJECT_NAMES.has(markedSubject)
        ? markedSubject
        : subject;
      return {
        answer,
        modelUsed: modelName,
        subject: detectedSubject,
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
