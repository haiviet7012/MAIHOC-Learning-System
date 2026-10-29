const MAX_PROMPT_LENGTH = 12000;
// Base64 expands binary uploads by roughly 4/3; enforce the 20 MB binary limit as well.
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FILE_BASE64_LENGTH = Math.ceil(MAX_FILE_BYTES * 4 / 3) + 16;
const ALLOWED_SUBJECTS = new Set([
  "Toán", "Tiếng Anh", "Vật lý", "Hóa học", "Ngữ văn", "Sinh học",
  "Đề thi THPT quốc gia", "IELTS"
]);
const ALLOWED_MODES = new Set(["quick", "detailed"]);
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/jpg"]);
const ALLOWED_PDF_TYPES = new Set(["application/pdf"]);

export function validateUniversalSolveRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, error: "Dữ liệu yêu cầu không hợp lệ." };
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const subject = String(body.subject || "").trim();
  const mode = String(body.mode || "detailed");
  const file = body.file && typeof body.file === "object" ? body.file : null;
  const image = body.image && typeof body.image === "object" ? body.image : null;

  if (!ALLOWED_SUBJECTS.has(subject)) {
    return { valid: false, error: "Môn học không được hỗ trợ." };
  }
  if (!ALLOWED_MODES.has(mode)) {
    return { valid: false, error: "Chế độ giải không hợp lệ." };
  }
  if (!prompt && !file && !image) {
    return { valid: false, error: "Hãy nhập đề bài, chọn ảnh hoặc tải tệp PDF lên." };
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return { valid: false, error: `Nội dung đề quá dài (tối đa ${MAX_PROMPT_LENGTH} ký tự).` };
  }

  let validatedImage = null;
  let validatedPdf = null;
  if (image) {
    const mimeType = String(image.mimeType || "").toLowerCase();
    const data = String(image.data || "").trim();
    if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
      return { valid: false, error: "Ảnh phải ở định dạng PNG, JPG hoặc WebP." };
    }
    if (!data || data.length > MAX_FILE_BASE64_LENGTH || Math.floor(data.length * 3 / 4) > MAX_FILE_BYTES) {
      return { valid: false, error: "Ảnh quá lớn. Vui lòng chọn ảnh tối đa 20 MB." };
    }
    validatedImage = { mimeType: mimeType === "image/jpg" ? "image/jpeg" : mimeType, data };
  }
  if (file) {
    const mimeType = String(file.mimeType || "").toLowerCase();
    const name = String(file.name || "de-bai.pdf").slice(0, 180);
    const data = String(file.data || "").trim();
    if (!ALLOWED_PDF_TYPES.has(mimeType) && !name.toLowerCase().endsWith(".pdf")) {
      return { valid: false, error: "Chỉ hỗ trợ tệp PDF." };
    }
    if (!data || data.length > MAX_FILE_BASE64_LENGTH || Math.floor(data.length * 3 / 4) > MAX_FILE_BYTES) {
      return { valid: false, error: "PDF quá lớn. Vui lòng chọn tệp tối đa 20 MB." };
    }
    validatedPdf = { mimeType: "application/pdf", name, data };
  }
  return { valid: true, data: { prompt, subject, mode, image: validatedImage, file: validatedPdf } };
}
