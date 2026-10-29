/**
 * server/chemistry/chemistry-validator.js
 * Bộ kiểm tra và chuẩn hóa dữ liệu đầu vào cho AI Solver Hóa học
 */

const MAX_PROMPT_LENGTH = 6000;
const MIN_PROMPT_LENGTH = 6;
const ALLOWED_GRADES = new Set(["all", "10", "11", "12"]);
const ALLOWED_MODES = new Set(["detailed", "hint", "concise"]);
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp"
]);
const MAX_IMAGE_BASE64_LENGTH = 7 * 1024 * 1024; // ~5MB tệp nhị phân base64

export function validateChemistrySolveRequest(body) {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Dữ liệu yêu cầu không hợp lệ." };
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const image = body.image && typeof body.image === "object" ? body.image : null;

  if (!prompt && !image) {
    return { valid: false, error: "Vui lòng nhập đề bài hoặc đính kèm ảnh chụp đề thi." };
  }

  if (prompt && prompt.length > MAX_PROMPT_LENGTH) {
    return { valid: false, error: `Nội dung đề bài quá dài (tối đa ${MAX_PROMPT_LENGTH} ký tự).` };
  }

  if (prompt && !image && prompt.length < MIN_PROMPT_LENGTH) {
    return { valid: false, error: "Nội dung câu hỏi quá ngắn để có thể giải." };
  }

  const grade = ALLOWED_GRADES.has(String(body.grade)) ? String(body.grade) : "all";
  const mode = ALLOWED_MODES.has(String(body.mode)) ? String(body.mode) : "detailed";

  let validatedImage = null;
  if (image) {
    const mimeType = String(image.mimeType || "").toLowerCase();
    const data = String(image.data || "").trim();

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return { valid: false, error: "Định dạng ảnh không được hỗ trợ. Vui lòng dùng PNG, JPG hoặc WebP." };
    }

    if (!data || data.length > MAX_IMAGE_BASE64_LENGTH) {
      return { valid: false, error: "Ảnh chụp đề vượt quá dung lượng cho phép (tối đa 5MB)." };
    }

    validatedImage = { mimeType, data };
  }

  return {
    valid: true,
    data: {
      prompt,
      image: validatedImage,
      grade,
      mode,
      topic: typeof body.topic === "string" ? body.topic.slice(0, 50) : "general"
    }
  };
}

