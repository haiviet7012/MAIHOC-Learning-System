import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { extractDocxText } from "./engine.js";

const solutionSchema = {
  type: SchemaType.OBJECT,
  properties: {
    questions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          targetId: { type: SchemaType.STRING },
          questionText: { type: SchemaType.STRING },
          answer: { type: SchemaType.STRING },
          explanation: { type: SchemaType.STRING },
          confidence: { type: SchemaType.NUMBER },
          uncertainty: { type: SchemaType.STRING },
          rubric: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                criterion: { type: SchemaType.STRING },
                points: { type: SchemaType.NUMBER }
              },
              required: ["criterion", "points"]
            }
          }
        },
        required: ["targetId", "questionText", "answer", "explanation", "confidence", "uncertainty", "rubric"]
      }
    }
  },
  required: ["questions"]
};

export function answerTargetsForLayout(layout) {
  const targets = [];
  for (const section of layout?.sections || []) {
    const sectionId = String(section.sectionId || section.order || "");
    const count = Math.max(0, Math.floor(Number(section.count) || 0));
    for (let number = 1; number <= count; number++) {
      const questionId = `${sectionId}-${number}`;
      if (section.type === "true_false") {
        for (const statement of (section.statements || ["a", "b", "c", "d"]).map(String)) {
          targets.push({ targetId: `${questionId}${statement}`, questionId, sectionId, number, statement, type: section.type,
            maximumPoints: Number(section.grading?.pointsByCorrectStatements?.[String((section.statements||["a","b","c","d"]).length)])||0 });
        }
      } else {
        targets.push({ targetId: questionId, questionId, sectionId, number, type: section.type,
          maximumPoints: Number(section.grading?.pointsPerCorrect)||0 });
      }
    }
  }
  return targets;
}

async function extractPdfContent(buffer,{includeImages=true}={}) {
  const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const canvasModule=includeImages?await import("@napi-rs/canvas"):null;
  if(canvasModule)for(const name of ["DOMMatrix","ImageData","Path2D"])if(!globalThis[name]&&canvasModule[name])globalThis[name]=canvasModule[name];
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false });
  const pdf = await task.promise;
  const pages = [];
  const images=[];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => String(item.str || "").trim()).filter(Boolean).join(" "));
      if(includeImages&&pageNumber<=12){
        const viewport=page.getViewport({scale:1.35});
        const canvas=canvasModule.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
        const context=canvas.getContext("2d");context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);
        await page.render({canvasContext:context,viewport,background:"#fff"}).promise;
        images.push({mimeType:"image/jpeg",data:canvas.toBuffer("image/jpeg",{quality:62}).toString("base64")});
      }
      page.cleanup?.();
    }
  } finally {
    await task.destroy();
  }
  return {text:pages.join("\n\n").trim(),images};
}

function parseModelJson(raw) {
  const text = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(text); } catch {}
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
  throw new Error("AI không trả về JSON hợp lệ cho bộ đáp án.");
}

async function generateWithDeepSeek({ apiKey, modelName, baseUrl, prompt, sourceText, images=[] }) {
  if (!apiKey) {
    const error = new Error("Chưa cấu hình DEEPSEEK_API_KEY trong server/.env.");
    error.code = "missing_api_key";
    throw error;
  }
  const supportsVision=!/v4-pro/i.test(String(modelName||""));
  const visualNote=images.length&&!supportsVision?"\n\nẢnh trang đề không được đính kèm cho model V4 Pro. Chỉ dựa vào phần text; nếu câu hỏi cần hình vẽ/bảng không có trong text, hãy để confidence thấp và nêu uncertainty.":"";
  const response = await fetch(`${String(baseUrl || "https://api.deepseek.com").replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelName || "deepseek-flash",
      messages: [{ role: "user", content: [
        {type:"text",text:`${prompt}\n\nNỘI DUNG VĂN BẢN ĐỌC ĐƯỢC TỪ ĐỀ:\n${sourceText}${images.length>12?"\n\nLưu ý: chỉ có ảnh 12 trang đầu; phần text có thể chứa các trang tiếp theo.":""}${visualNote}`},
        ...(supportsVision?images.slice(0,12).map(image=>({type:"image_url",image_url:{url:`data:${image.mimeType};base64,${image.data}`}})):[])
      ] }],
      response_format: { type: "json_object" },
      thinking: { type: "enabled" },
      max_tokens: 24000,
      stream: false
    }),
    signal: AbortSignal.timeout(180000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error?.message || `DeepSeek API trả về HTTP ${response.status}.`);
    error.status = response.status;
    error.code = /insufficient balance/i.test(error.message) ? "insufficient_balance"
      : response.status === 429 ? "quota_exhausted" : `deepseek_http_${response.status}`;
    throw error;
  }
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek không trả nội dung đáp án; hãy kiểm tra giới hạn token hoặc cấu hình model.");
  return parseModelJson(content);
}

export async function solveExamDocument({
  buffer,
  filename,
  title,
  layout,
  grading,
  customTargets = null,
  modelName,
  apiKey,
  provider = "gemini",
  baseUrl,
  referenceAnswerKey = null
}) {
  const layoutTargets = answerTargetsForLayout(layout);
  const hasCustomTargets = Array.isArray(customTargets) && customTargets.length > 0;
  const targets = hasCustomTargets
    ? customTargets.map((t, idx) => ({
        targetId: String(t.targetId || `I-${idx + 1}`),
        questionId: String(t.questionId || t.targetId || `I-${idx + 1}`),
        sectionId: String(t.sectionId || "I"),
        number: Number(t.number) || idx + 1,
        ...(t.statement ? { statement: String(t.statement) } : {}),
        type: String(t.type || "multiple_choice"),
        maximumPoints: Number(t.maximumPoints) || 0.25
      }))
    : layoutTargets;

  if (!targets.length) throw new Error("Không có criteria câu hỏi trong configs/exam-layouts.json.");
  if (!hasCustomTargets && (!grading || !(layout?.sections || []).filter(section => Number(section.count) > 0).every(section => section.grading))) {
    throw new Error("Thiếu criteria chấm điểm trong configs/exam-layouts.json.");
  }
  const effectiveGrading = grading || { scale: 10 };
  const selectedProvider=String(provider||"gemini").toLowerCase();
  if (!apiKey) {
    const error = new Error("Chưa cấu hình GEMINI_API_KEY trong server/.env.");
    error.code = "missing_api_key";
    throw error;
  }
  const extension = String(filename || "").toLowerCase().split(".").pop();
  const prompt = [
    "Bạn là engine giải đề và tạo dữ liệu chấm cho hệ thống thi. Đọc chính xác đề, kể cả bảng, ký hiệu và hình vẽ nếu nội dung đó được mô tả trong văn bản.",
    "Giải từng câu độc lập, không đoán nếu thiếu dữ kiện. Chép chính xác nội dung câu hỏi liên quan đến target; giữ công thức ở dạng LaTeX khi phù hợp.",
    "Mỗi targetId là một đáp án nguyên tử. Trắc nghiệm trả về một chữ cái lựa chọn (A, B, C hoặc D). Đúng/sai trả về true hoặc false cho đúng mệnh đề được nêu trong targetId. Trả lời ngắn ghi đáp án chuẩn và các bước tương đương vào explanation. Tự luận ghi kết luận, lời giải mẫu và rubric với điểm từng tiêu chí.",
    "Rubric phải có tổng điểm khớp với maximumPoints của từng target. Nếu không đọc rõ câu, hình, mã đề hoặc không chắc đáp án, nêu rõ uncertainty và confidence thấp; tuyệt đối không tự bịa dữ kiện.",
    "Hãy trả về đúng một đối tượng JSON hợp lệ, không thêm markdown hay văn bản ngoài JSON, theo cấu trúc {\"questions\":[{\"targetId\":\"...\",\"questionText\":\"...\",\"answer\":\"...\",\"explanation\":\"...\",\"confidence\":0.0,\"uncertainty\":\"...\",\"rubric\":[{\"criterion\":\"...\",\"points\":0}]}]}.",
    `Tên đề: ${String(title || "").slice(0, 160)}`,
    `Cấu hình chấm: ${JSON.stringify({ layout: layout || null, grading: effectiveGrading })}`,
    referenceAnswerKey?.answers ? `Đáp án file tham chiếu (chỉ dùng để đối chiếu độc lập, đề vẫn là nguồn chính): ${JSON.stringify(referenceAnswerKey.answers)}` : "Không có file đáp án tham chiếu; hãy tự giải từng câu.",
    `Các target bắt buộc: ${JSON.stringify(targets)}`
  ].join("\n\n");

  let generated;
  let resolvedModelName = modelName || "gemini-2.5-flash";
  if(selectedProvider==="deepseek"){
    const source = extension === "docx" ? extractDocxText(Buffer.from(buffer))
      : extension === "txt" ? Buffer.from(buffer).toString("utf8") : "";
    let images=[];
    let pdfText="";
    if(extension==="pdf"){
      const pdfContent=await extractPdfContent(Buffer.from(buffer));pdfText=pdfContent.text;images=pdfContent.images;
    }else if(["png","jpg","jpeg","webp"].includes(extension)){
      const mimeType=extension==="jpg"?"image/jpeg":`image/${extension}`;
      images=[{mimeType,data:Buffer.from(buffer).toString("base64")}];
    }
    const sourceText=extension==="pdf"?pdfText:source;
    if(/v4-pro/i.test(String(modelName||""))&&!sourceText.trim()){
      const error=new Error("DeepSeek V4 Pro chỉ nhận văn bản, không đọc được đề scan/ảnh. Hãy dùng deepseek-flash để xử lý đề có hình vẽ hoặc PDF scan.");
      error.code="unsupported_deepseek_vision";
      throw error;
    }
    if(!source.trim()){
      if(images.length&&extension!=="pdf"){
        // Image-only uploads are sent as visual input below.
      }else if(extension==="pdf"&&images.length){
        // Scanned PDFs are still readable through the rendered page images.
      }else{
        const error = new Error("Không đọc được nội dung đề. PDF scan không có text và không thể render, hoặc định dạng này chưa được hỗ trợ.");
        error.code = "unsupported_deepseek_input";
        throw error;
      }
    }
    if(!sourceText.trim()&&!images.length){
      const error = new Error("Không đọc được nội dung đề để gửi cho DeepSeek.");
      error.code = "unsupported_deepseek_input";
      throw error;
    }
    generated=await generateWithDeepSeek({apiKey,modelName,baseUrl,prompt,sourceText:sourceText.slice(0,90000),images});
  }else if(selectedProvider!=="gemini"){
    const error=new Error(`Nhà cung cấp AI không được hỗ trợ: ${selectedProvider}.`);error.code="unsupported_ai_provider";throw error;
  }

  const mimeTypes = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };
  const contentParts = [];
  if (selectedProvider==="gemini"&&mimeTypes[extension]) {
    contentParts.push({ inlineData: { mimeType: mimeTypes[extension], data: Buffer.from(buffer).toString("base64") } });
  } else if(selectedProvider==="gemini") {
    const source = extension === "docx"
      ? extractDocxText(Buffer.from(buffer))
      : extension === "txt" ? Buffer.from(buffer).toString("utf8") : "";
    if (!source.trim()) throw new Error("Định dạng đề chưa hỗ trợ giải tự động. Hãy dùng PDF, DOCX, TXT hoặc ảnh PNG/JPG.");
    contentParts.push({ text: `NỘI DUNG ĐỀ THI:\n${source.slice(0, 90000)}` });
  }

  if(selectedProvider==="gemini"){
    contentParts.push({ text: prompt });
    const client = new GoogleGenerativeAI(apiKey);
    const tryModels = [modelName || "gemini-2.5-flash"];
    if (!tryModels.includes("gemini-2.5-flash")) tryModels.push("gemini-2.5-flash");
    if (!tryModels.includes("gemini-2.0-flash")) tryModels.push("gemini-2.0-flash");

    let lastErr = null;
    for (const candidateModel of tryModels) {
      try {
        const model = client.getGenerativeModel({
          model: candidateModel,
          generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: solutionSchema }
        });
        const response = await model.generateContent({ contents: [{ role: "user", parts: contentParts }] });
        generated = parseModelJson(response.response.text());
        resolvedModelName = candidateModel;
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        const msg = String(err?.message || "").toLowerCase();
        if (msg.includes("404") || msg.includes("not found") || msg.includes("is not supported")) {
          continue;
        }
        throw err;
      }
    }
    if (lastErr && !generated) throw lastErr;
  }

  const allowed = new Map(targets.map(target => [target.targetId, target]));
  const byId = new Map();
  for (const item of generated.questions || []) {
    const target = allowed.get(String(item.targetId || ""));
    if (!target || byId.has(target.targetId)) continue;
    const maxPts = Number(target.maximumPoints) || 0.25;
    let rawRubric = Array.isArray(item.rubric) ? item.rubric.slice(0, 20).map(row => ({
      criterion: String(row.criterion || "").slice(0, 1000),
      points: Math.max(0, Math.min(10, Number(row.points) || 0))
    })).filter(r => r.criterion) : [];
    const rubricSum = rawRubric.reduce((s, r) => s + r.points, 0);
    if (!rawRubric.length) {
      rawRubric = [{ criterion: `Đáp án đúng cho câu ${target.targetId}`, points: maxPts }];
    } else if (target.type === "essay" && maxPts > 0 && Math.abs(rubricSum - maxPts) > 0.01) {
      if (rubricSum > 0) {
        rawRubric = rawRubric.map((r, idx, arr) => ({
          ...r,
          points: idx === arr.length - 1
            ? Math.max(0, Math.round((maxPts - arr.slice(0, -1).reduce((acc, x) => acc + Math.round((x.points / rubricSum) * maxPts * 100) / 100, 0)) * 100) / 100)
            : Math.round((r.points / rubricSum) * maxPts * 100) / 100
        }));
      } else {
        rawRubric[0].points = maxPts;
      }
    }
    byId.set(target.targetId, {
      targetId: target.targetId,
      questionId: target.questionId,
      type: target.type,
      maximumPoints: maxPts,
      questionText: String(item.questionText || "").slice(0, 5000),
      answer: String(item.answer || "").trim().slice(0, 2000),
      referenceAnswer: referenceAnswerKey?.answers?.[target.targetId] == null ? "" : String(Array.isArray(referenceAnswerKey.answers[target.targetId]) ? referenceAnswerKey.answers[target.targetId].join(" | ") : referenceAnswerKey.answers[target.targetId]).slice(0, 2000),
      explanation: String(item.explanation || "").trim().slice(0, 12000),
      rubric: rawRubric,
      confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0)),
      uncertainty: String(item.uncertainty || "").slice(0, 2000),
      reviewStatus: "pending"
    });
  }
  const questions = targets.map(target => byId.get(target.targetId) || {
    targetId: target.targetId,
    questionId: target.questionId,
    type: target.type,
    maximumPoints: Number(target.maximumPoints) || 0.25,
    questionText: target.questionText || "Không đọc được câu này từ đề.",
    answer: "",
    referenceAnswer: referenceAnswerKey?.answers?.[target.targetId] == null ? "" : String(referenceAnswerKey.answers[target.targetId]),
    explanation: "",
    rubric: [{ criterion: `Đáp án đúng cho câu ${target.targetId}`, points: Number(target.maximumPoints) || 0.25 }],
    confidence: 0,
    uncertainty: "AI không trả về target bắt buộc.",
    reviewStatus: "pending"
  });
  return {
    schemaVersion: 1,
    provider:selectedProvider,
    model: resolvedModelName,
    scale: Number(effectiveGrading?.scale) || 10,
    generatedAt: new Date().toISOString(),
    questions,
    answerCount: questions.filter(question => question.answer).length,
    requiredCount: targets.length
  };
}

export function isAIQuotaError(error) {
  const text = `${error?.status || ""} ${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  return /402|429|quota|resource_exhausted|rate.?limit|billing|payment required/.test(text);
}
