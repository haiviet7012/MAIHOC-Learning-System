import { inflateRawSync } from "node:zlib";
import { spawn } from "node:child_process";

function parseCsvLine(line, delimiter = ",") {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"' && quoted) {
      value += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }
  cells.push(value.trim());
  return cells;
}

function detectDelimiter(line) {
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) {
      index++;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && Object.hasOwn(counts, character)) {
      counts[character]++;
    }
  }
  return Object.entries(counts).sort((left, right) => right[1] - left[1])[0][1] > 0
    ? Object.entries(counts).sort((left, right) => right[1] - left[1])[0][0]
    : ",";
}

function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0110\u0111]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return null;
  const questionHeaders = new Set(["question", "question_id", "question_no", "question_number", "cau", "cau_hoi", "cau_so", "q", "id", "stt"]);
  const answerHeaders = new Set(["answer", "answers", "answer_key", "correct_answer", "correctanswer", "correct", "key", "dap_an", "dap_an_dung"]);
  let headerIndex = -1;
  let delimiter = ",";
  let headers = [];
  for (let index = 0; index < Math.min(lines.length - 1, 12); index++) {
    const candidateDelimiter = detectDelimiter(lines[index]);
    const candidateHeaders = parseCsvLine(lines[index], candidateDelimiter).map(normalizeHeader);
    if (candidateHeaders.some(value => questionHeaders.has(value)) && candidateHeaders.some(value => answerHeaders.has(value))) {
      headerIndex = index;
      delimiter = candidateDelimiter;
      headers = candidateHeaders;
      break;
    }
  }
  if (headerIndex < 0) return null;
  const questionIndex = headers.findIndex((value) => questionHeaders.has(value));
  const answerIndex = headers.findIndex((value) => answerHeaders.has(value));
  const pointsIndex = headers.findIndex(value => ["points", "point", "score", "diem", "diem_so"].includes(value));
  const acceptedIndex = headers.findIndex((value) => ["accepted", "accepted_answers", "alternatives", "dap_an_chap_nhan"].includes(value));
  const answers = {};
  const points = {};
  for (const line of lines.slice(headerIndex + 1)) {
    const cells = parseCsvLine(line, delimiter);
    const question = cells[questionIndex]?.trim();
    const answer = cells[answerIndex]?.trim();
    if (!question || !answer) continue;
    answers[question] = acceptedIndex >= 0 && cells[acceptedIndex]
      ? [answer, ...cells[acceptedIndex].split("|").map((value) => value.trim()).filter(Boolean)]
      : answer;
    if (pointsIndex >= 0 && Number.isFinite(Number(cells[pointsIndex])) && Number(cells[pointsIndex]) > 0) points[question] = Number(cells[pointsIndex]);
  }
  return Object.keys(answers).length ? { answers, points } : null;
}

export function parseAnswerKey(buffer, filename = "") {
  if (!buffer?.length) return null;
  const extension = String(filename).toLowerCase().split(".").pop();
  if (!["json", "csv", "txt"].includes(extension)) return null;
  const bytes = Buffer.from(buffer);
  let text;
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    text = bytes.subarray(2).toString("utf16le");
  } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.from(bytes.subarray(2));
    for (let index = 0; index + 1 < swapped.length; index += 2) [swapped[index], swapped[index + 1]] = [swapped[index + 1], swapped[index]];
    text = swapped.toString("utf16le");
  } else {
    text = bytes.toString("utf8");
    const replacementCount = (text.match(/\uFFFD/g) || []).length;
    if (replacementCount > 0) {
      try { text = new TextDecoder("windows-1258").decode(bytes); } catch {}
    }
  }
  text = text.replace(/^\uFEFF/, "").trim();
  if (!text) return null;

  if (extension === "csv") {
    try { return parseCsv(text); } catch { return null; }
  }
  if (extension === "json" || text.startsWith("{") || text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      const rawAnswers = parsed.answers ?? parsed.answerKey ?? parsed.questions ?? parsed;
      if (!Array.isArray(rawAnswers) && (!rawAnswers || typeof rawAnswers !== "object")) return null;
      const entries = Array.isArray(rawAnswers)
        ? rawAnswers.map((row) => [row.question ?? row.questionNumber ?? row.questionNo ?? row.number ?? row.cau ?? row.id, row])
        : Object.entries(rawAnswers);
      const answers = {};
      const points = { ...(parsed.points || {}) };
      for (const [question, value] of entries) {
        if (question == null || ["points", "answers", "answerKey", "questions", "title", "schemaVersion"].includes(String(question))) continue;
        if (value && typeof value === "object" && !Array.isArray(value)) {
          const answer = value.answer ?? value.answers ?? value.acceptedAnswers ?? value.correctAnswer ?? value.correct ?? value.key;
          if (answer == null) {
            const statements = Object.entries(value).filter(([id, statementAnswer]) => /^[a-d]$/i.test(id) && statementAnswer != null);
            for (const [id, statementAnswer] of statements) answers[`${question}${id.toLowerCase()}`] = statementAnswer;
            continue;
          }
          answers[String(question)] = answer;
          if (Number.isFinite(Number(value.points)) && Number(value.points) > 0) points[String(question)] = Number(value.points);
        } else {
          answers[String(question)] = value;
        }
      }
      return Object.keys(answers).length ? { answers, points } : null;
    } catch { return null; }
  }

  const answers = {};
  const points = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:(?:ph\u1ea7n|phan|section|part)\s*([ivx]+|\d+)[\s,.:_-]*(?:(?:c\u00e2u|cau|question|q)\s*)?)?(?:(?:c\u00e2u|cau|question|q)\s*)?((?:[ivx]+[-._:]?)?\d{1,3}[a-d]?)\s*(?::|=|[.)-]\s*|\t|\s+)\s*(.+?)\s*$/iu);
    if (!match) continue;
    const question = match[1] ? `${match[1]}-${match[2]}` : match[2];
    let answerText = match[3].trim();
    const pointsMatch = answerText.match(/^(.*?)\s*;\s*(?:points?|diem|\u0111i\u1ec3m)\s*[:=]\s*(\d+(?:\.\d+)?)\s*$/i);
    if (pointsMatch) {
      answerText = pointsMatch[1].trim();
      if (Number.isFinite(Number(pointsMatch[2])) && Number(pointsMatch[2]) > 0) points[question] = Number(pointsMatch[2]);
    }
    const accepted = answerText.split(/\s*\|\s*/).map((value) => value.trim()).filter(Boolean);
    if (!accepted.length) continue;
    answers[question] = accepted.length > 1 ? accepted : accepted[0];
  }
  return Object.keys(answers).length ? { answers, points } : null;
}

export function normalizeAnswerKey(buffer, filename = "") {
  return normalizeParsedAnswerKey(parseAnswerKey(buffer, filename));
}

function normalizeParsedAnswerKey(parsed) {
  if (!parsed) return null;
  const answers = {};
  for (const [question, value] of Object.entries(parsed.answers)) {
    if (!question.trim()) continue;
    const accepted = (Array.isArray(value) ? value : [value])
      .flatMap(answer => typeof answer === "string" ? answer.split(/\s*\|\s*/) : [answer])
      .map((answer) => String(answer ?? "").trim())
      .filter(Boolean);
    if (accepted.length) answers[question] = accepted.length > 1 ? accepted : accepted[0];
  }
  if (!Object.keys(answers).length) return null;
  const points = Object.fromEntries(Object.entries(parsed.points || {})
    .filter(([question, value]) => question in answers && Number.isFinite(Number(value)) && Number(value) > 0)
    .map(([question, value]) => [question, Number(value)]));
  return { schemaVersion: 1, normalizerVersion: 2, answers, points };
}

async function extractPdfAnswerRows(buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: Uint8Array.from(buffer),
    useSystemFonts: true,
    isEvalSupported: false
  });
  const pdf = await loadingTask.promise;
  const rows = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageRows = [];
      for (const item of content.items) {
        if (!item.str?.trim()) continue;
        const x = Number(item.transform?.[4] || 0);
        const y = Number(item.transform?.[5] || 0);
        let row = pageRows.find(candidate => Math.abs(candidate.y - y) <= 3.5);
        if (!row) {
          row = { pageNumber, y, items: [] };
          pageRows.push(row);
        }
        row.items.push({ x, width: Number(item.width) || 0, text: item.str });
      }
      pageRows.sort((left, right) => right.y - left.y);
      for (const row of pageRows) {
        row.items.sort((left, right) => left.x - right.x);
        row.text = tableCellText(row, Number.NEGATIVE_INFINITY);
        rows.push(row);
      }
      page.cleanup();
    }
  } finally {
    // PDFDocumentProxy in the installed pdf.js release exposes cleanup(); the
    // loading task owns the worker and is the supported object to destroy.
    await loadingTask.destroy();
  }
  return rows;
}

function runTesseract(png) {
  return new Promise((resolve, reject) => {
    const command = process.env.TESSERACT_PATH || "tesseract";
    const child = spawn(command, ["stdin", "stdout", "-l", "eng", "--psm", "6", "tsv"], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const output = [];
    const errors = [];
    let outputSize = 0;
    const timeout = setTimeout(() => child.kill(), 8000);
    timeout.unref?.();
    child.stdout.on("data", chunk => {
      outputSize += chunk.length;
      if (outputSize <= 2 * 1024 * 1024) output.push(chunk);
      else child.kill();
    });
    child.stderr.on("data", chunk => errors.push(chunk));
    child.once("error", error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", code => {
      clearTimeout(timeout);
      if (code === 0 && outputSize <= 2 * 1024 * 1024) resolve(Buffer.concat(output).toString("utf8"));
      else reject(new Error(Buffer.concat(errors).toString("utf8").trim() || `Tesseract exited with status ${code}.`));
    });
    child.stdin.once("error", () => {});
    child.stdin.end(png);
  });
}

function rowsFromTesseract(tsv) {
  const rowsById = new Map();
  const lines = String(tsv).split(/\r?\n/);
  for (const line of lines.slice(1)) {
    const fields = line.split("\t");
    if (fields.length < 12 || fields[0] !== "5" || !fields[11]?.trim()) continue;
    const [pageNumber, blockNumber, paragraphNumber, lineNumber] = fields.slice(1, 5).map(Number);
    const x = Number(fields[6]);
    const y = Number(fields[7]);
    const width = Number(fields[8]);
    const confidence = Number(fields[10]);
    if (![pageNumber, blockNumber, paragraphNumber, lineNumber, x, y, width].every(Number.isFinite)) continue;
    const id = `${pageNumber}:${blockNumber}:${paragraphNumber}:${lineNumber}`;
    let row = rowsById.get(id);
    if (!row) {
      row = { pageNumber, y: -y, items: [], ocr: true };
      rowsById.set(id, row);
    }
    row.items.push({ x, width, text: fields[11].trim(), confidence });
  }
  return [...rowsById.values()]
    .map(row => {
      row.items.sort((left, right) => left.x - right.x);
      row.text = tableCellText(row, Number.NEGATIVE_INFINITY);
      return row;
    })
    .sort((left, right) => left.pageNumber - right.pageNumber || right.y - left.y);
}

async function extractPdfOcrRows(buffer) {
  const [pdfjs, canvasModule] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("@napi-rs/canvas")
  ]);
  for (const name of ["DOMMatrix", "ImageData", "Path2D"]) {
    if (!globalThis[name] && canvasModule[name]) globalThis[name] = canvasModule[name];
  }
  const loadingTask = pdfjs.getDocument({
    data: Uint8Array.from(buffer),
    useSystemFonts: true,
    isEvalSupported: false
  });
  const pdf = await loadingTask.promise;
  const rows = [];
  try {
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 6); pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = canvasModule.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport, background: "#ffffff" }).promise;
      const tsv = await runTesseract(canvas.toBuffer("image/png"));
      rows.push(...rowsFromTesseract(tsv));
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  return rows;
}

function tableCellText(row, lowerX, upperX = Number.POSITIVE_INFINITY) {
  const items = row.items.filter(item => item.x >= lowerX && item.x < upperX);
  let output = "";
  let previous = null;
  for (const item of items) {
    if (previous) {
      const previousWidth = previous.width || Math.max(2, previous.text.length * 3);
      const gap = item.x - (previous.x + previousWidth);
      output += gap > 2 ? " " : "";
    }
    output += item.text;
    previous = item;
  }
  return output.replace(/\s+/g, " ").trim();
}

function cellConfidenceOk(row, lowerX, upperX = Number.POSITIVE_INFINITY) {
  return row.items.filter(item => item.x >= lowerX && item.x < upperX)
    .every(item => item.confidence == null || item.confidence >= 60);
}

function normalizedPdfText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0110\u0111]/g, "d")
    .toLowerCase();
}

function questionNumberInCell(text) {
  const normalized = normalizedPdfText(text).replace(/[.:)]/g, " ").replace(/\s+/g, " ").trim();
  const match = normalized.match(/^(?:(?:cau|question|q)\s*)?0*(\d{1,3})$/);
  return match ? Number(match[1]) : null;
}

function pdfVariantCells(row) {
  const variants = [];
  for (const item of row.items) {
    if (item.confidence != null && item.confidence < 60) continue;
    const text = item.text.trim();
    for (const match of text.matchAll(/(?<!\d)\d{3,6}(?!\d)/g)) {
      const leading = text.slice(0, match.index);
      const offset = leading ? (item.width * leading.length / Math.max(1, text.length)) : 0;
      variants.push({ id: match[0], x: item.x + offset });
    }
  }
  const numericItems = row.items.filter(item => /^\d{1,3}$/.test(item.text.trim())
    && (item.confidence == null || item.confidence >= 60));
  for (let start = 0; start < numericItems.length; start++) {
    let digits = "";
    let previous = null;
    for (let index = start; index < Math.min(numericItems.length, start + 4); index++) {
      const item = numericItems[index];
      if (previous && item.x - (previous.x + (previous.width || previous.text.length * 3)) > 3) break;
      digits += item.text.trim();
      if (digits.length >= 3 && digits.length <= 6) variants.push({ id: digits, x: numericItems[start].x });
      if (digits.length > 6) break;
      previous = item;
    }
  }
  const unique = new Map();
  for (const variant of variants) if (!unique.has(variant.id)) unique.set(variant.id, variant);
  return [...unique.values()].sort((left, right) => left.x - right.x);
}

function findQuestionUpperX(rows, headerIndex, firstAnswerX) {
  const header = rows[headerIndex];
  const questionLabel = header.items.find(item => /^(?:cau|question|q|stt|no\.?|so)$/i.test(normalizedPdfText(item.text).trim()));
  let questionX = questionLabel?.x;
  if (questionX == null) {
    for (const row of rows.slice(headerIndex + 1)) {
      const numberItem = row.items.find(item => item.x < firstAnswerX && questionNumberInCell(item.text) != null);
      if (numberItem) {
        questionX = numberItem.x;
        break;
      }
    }
  }
  if (questionX == null || questionX >= firstAnswerX) return firstAnswerX - 12;
  return (questionX + firstAnswerX) / 2;
}

function answerChoiceFromCell(value) {
  const cleaned = normalizedPdfText(value)
    .replace(/^(?:dap\s*an|answer|key)\s*[:=.-]?\s*/i, "")
    .trim();
  const matches = [...cleaned.matchAll(/(?:^|[^a-z])([a-d])(?=$|[^a-z])/gi)];
  if (matches.length === 1) return matches[0][1].toUpperCase();
  if (/^[a-d][.)]?$/i.test(cleaned)) return cleaned[0].toUpperCase();
  return "";
}

function parseTrueFalseCell(text, expectedCount) {
  const normalized = normalizedPdfText(text).replace(/(?:dap\s*an|answer|key)\s*[:=.-]?/g, " ");
  const labeledTokens = [...normalized.matchAll(/\b[a-d]\s*[).:]\s*(dung|sai|true|false|d|s)\b/g)].map(match => match[1]);
  if (labeledTokens.length === expectedCount) return labeledTokens.map(token => /^(?:dung|true|d)$/.test(token) ? "true" : "false");
  const compact = normalized.replace(/[^a-z]/g, "");
  if (!compact || compact.length > 80) return [];
  const forms = [["false", "false"], ["true", "true"], ["dung", "true"], ["sai", "false"], ["f", "false"], ["t", "true"], ["d", "true"], ["s", "false"]];
  function splitTokens(offset, remaining) {
    if (offset === compact.length) return remaining === 0 ? [] : null;
    if (remaining <= 0) return null;
    for (const [token, answer] of forms) {
      if (!compact.startsWith(token, offset)) continue;
      const rest = splitTokens(offset + token.length, remaining - 1);
      if (rest) return [answer, ...rest];
    }
    return null;
  }
  return splitTokens(0, expectedCount) || [];
}

function configuredQuestionCount(layout) {
  return layout.sections.reduce((total, section) => total + Math.max(0, Math.floor(Number(section.count) || 0)), 0);
}

function configuredAnswerCount(layout) {
  return layout.sections.reduce((total, section) => {
    const count = Math.max(0, Math.floor(Number(section.count) || 0));
    return total + count * (section.type === "true_false" ? (section.statements || ["a", "b", "c", "d"]).length : 1);
  }, 0);
}

function readPdfRows(dataRows, questionUpperX, columns, layout) {
  const answersByColumn = Object.fromEntries(columns.map(column => [column.id, {}]));
  let cursor = 0;
  for (const section of layout.sections) {
    const count = Math.max(0, Math.floor(Number(section.count) || 0));
    for (let index = 0; index < count; index++) {
      const row = dataRows[cursor++];
      if (!row) continue;
      if (!cellConfidenceOk(row, Number.NEGATIVE_INFINITY, questionUpperX)) continue;
      const parsedNumber = questionNumberInCell(tableCellText(row, Number.NEGATIVE_INFINITY, questionUpperX));
      const questionNumber = parsedNumber >= 1 && parsedNumber <= count ? parsedNumber : index + 1;
      const sectionId = String(section.sectionId || section.order || "");
      for (const column of columns) {
        if (!cellConfidenceOk(row, column.lowerX, column.upperX)) continue;
        const value = tableCellText(row, column.lowerX, column.upperX);
        if (!value) continue;
        if (section.type === "multiple_choice") {
          const answer = answerChoiceFromCell(value);
          if (answer) answersByColumn[column.id][`${sectionId}-${questionNumber}`] = answer;
        } else if (section.type === "true_false") {
          const statementIds = (section.statements || ["a", "b", "c", "d"]).map(String);
          parseTrueFalseCell(value, statementIds.length).forEach((answer, statementIndex) => {
            answersByColumn[column.id][`${sectionId}-${questionNumber}${statementIds[statementIndex]}`] = answer;
          });
        } else if (section.type === "essay" || section.type === "short_answer") {
          answersByColumn[column.id][`${sectionId}-${questionNumber}`] = value;
        }
      }
    }
  }
  return answersByColumn;
}

function findSimplePdfTable(rows, layout) {
  const headerIndex = rows.findIndex(row => {
    const labels = row.items.map(item => normalizedPdfText(item.text));
    return labels.some(text => /cau|question/.test(text)) && labels.some(text => /dap\s*an|answer|key/.test(text));
  });
  if (headerIndex >= 0) {
    const header = rows[headerIndex];
    const questionLabel = header.items.find(item => /cau|question|stt|no\.?/.test(normalizedPdfText(item.text)));
    const answerLabel = header.items.find(item => /dap\s*an|answer|key/.test(normalizedPdfText(item.text)));
    if (questionLabel && answerLabel && answerLabel.x > questionLabel.x) {
      const questionUpperX = (questionLabel.x + answerLabel.x) / 2;
      const dataRows = rows.slice(headerIndex + 1).filter(row =>
        questionNumberInCell(tableCellText(row, Number.NEGATIVE_INFINITY, questionUpperX)) != null
        && cellConfidenceOk(row, Number.NEGATIVE_INFINITY, questionUpperX)
        && cellConfidenceOk(row, answerLabel.x - 2)
        && tableCellText(row, answerLabel.x - 2).length > 0
      );
      if (dataRows.length) return { dataRows, questionUpperX, answerX: answerLabel.x - 2 };
    }
  }

  const splits = new Set();
  for (const row of rows) {
    const xs = row.items.map(item => item.x).sort((left, right) => left - right);
    for (let index = 1; index < xs.length; index++) {
      if (xs[index] - xs[index - 1] > 8) splits.add((xs[index] + xs[index - 1]) / 2);
    }
  }
  let best = null;
  for (const split of splits) {
    const dataRows = rows.filter(row => questionNumberInCell(tableCellText(row, Number.NEGATIVE_INFINITY, split)) != null
      && cellConfidenceOk(row, Number.NEGATIVE_INFINITY, split)
      && cellConfidenceOk(row, split)
      && tableCellText(row, split).length > 0);
    if (!best || dataRows.length > best.dataRows.length) best = { dataRows, questionUpperX: split, answerX: split };
  }
  const minimumRows = Math.min(3, Math.max(1, configuredQuestionCount(layout)));
  return best?.dataRows.length >= minimumRows ? best : null;
}

function normalizePdfAnswerRows(rows, layout, grading) {
  if (!rows.length) return null;
  const candidates = rows.map((row, index) => ({ row, index, variants: pdfVariantCells(row) }))
    .filter(candidate => candidate.variants.length > 0)
    .map(candidate => {
      const firstX = candidate.variants[0].x;
      const questionUpperX = findQuestionUpperX(rows, candidate.index, firstX);
      const dataRows = rows.slice(candidate.index + 1).filter(row =>
        questionNumberInCell(tableCellText(row, Number.NEGATIVE_INFINITY, questionUpperX)) != null
        && cellConfidenceOk(row, Number.NEGATIVE_INFINITY, questionUpperX)
        && row.items.some(item => item.x >= questionUpperX && item.text.trim())
      );
      return {
        ...candidate,
        questionUpperX,
        dataRows,
        labeled: /ma\s*de|exam\s*code|variant/.test(normalizedPdfText(candidate.row.text))
      };
    })
    .filter(candidate => candidate.dataRows.length > 0)
    .sort((left, right) => Number(right.labeled) - Number(left.labeled)
      || right.variants.length - left.variants.length
      || right.dataRows.length - left.dataRows.length);

  let answersByVariant;
  let variantIds;
  if (candidates.length) {
    const header = candidates[0];
    const variants = header.variants;
    const columns = variants.map((variant, index) => ({
      ...variant,
      lowerX: index === 0 ? header.questionUpperX : (variants[index - 1].x + variant.x) / 2,
      upperX: index + 1 < variants.length ? (variant.x + variants[index + 1].x) / 2 : Number.POSITIVE_INFINITY
    }));
    answersByVariant = readPdfRows(header.dataRows, header.questionUpperX, columns, layout);
    variantIds = variants.map(variant => variant.id);
  } else {
    const simple = findSimplePdfTable(rows, layout);
    if (!simple) return null;
    answersByVariant = readPdfRows(simple.dataRows, simple.questionUpperX, [{
      id: "default", lowerX: simple.answerX, upperX: Number.POSITIVE_INFINITY
    }], layout);
    variantIds = ["default"];
  }

  const preferred = String(grading?.defaultAnswerVariant || "");
  const preferredAnswers = answersByVariant[preferred];
  const selectedVariant = preferredAnswers && Object.keys(preferredAnswers).length
    ? preferred
    : variantIds.find(id => Object.keys(answersByVariant[id] || {}).length >= configuredAnswerCount(layout))
      || variantIds.reduce((best, id) => Object.keys(answersByVariant[id] || {}).length > Object.keys(answersByVariant[best] || {}).length ? id : best, variantIds[0]);
  const answers = selectedVariant ? answersByVariant[selectedVariant] : null;
  if (!answers || !Object.keys(answers).length) return null;
  return { schemaVersion: 1, normalizerVersion: 2, answers, points: {}, selectedVariant, availableVariants: variantIds };
}

async function normalizePdfAnswerKey(buffer, layout, grading) {
  if (!Array.isArray(layout?.sections) || !layout.sections.length) return null;
  let textRows = [];
  try {
    textRows = await extractPdfAnswerRows(buffer);
  } catch (error) {
    console.warn("Could not extract selectable text from answer key PDF:", error.message);
  }
  const textResult = normalizePdfAnswerRows(textRows, layout, grading);
  if (textResult) return textResult;
  try {
    const ocrRows = await extractPdfOcrRows(buffer);
    return normalizePdfAnswerRows(ocrRows, layout, grading);
  } catch (error) {
    console.warn("Could not OCR answer key PDF:", error.message);
    return null;
  }
}

function decodeXmlText(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(parseInt(hex, 16)));
}

export function extractDocxText(buffer) {
  const bytes = Buffer.from(buffer);
  const searchStart = Math.max(0, bytes.length - 0xffff - 22);
  let directoryEnd = -1;
  for (let offset = bytes.length - 22; offset >= searchStart; offset--) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      directoryEnd = offset;
      break;
    }
  }
  if (directoryEnd < 0) throw new Error("The DOCX archive directory is missing.");
  const entryCount = bytes.readUInt16LE(directoryEnd + 10);
  let centralOffset = bytes.readUInt32LE(directoryEnd + 16);
  let documentEntry = null;
  for (let index = 0; index < entryCount; index++) {
    if (bytes.readUInt32LE(centralOffset) !== 0x02014b50) throw new Error("The DOCX archive directory is invalid.");
    const method = bytes.readUInt16LE(centralOffset + 10);
    const compressedSize = bytes.readUInt32LE(centralOffset + 20);
    const filenameLength = bytes.readUInt16LE(centralOffset + 28);
    const extraLength = bytes.readUInt16LE(centralOffset + 30);
    const commentLength = bytes.readUInt16LE(centralOffset + 32);
    const localOffset = bytes.readUInt32LE(centralOffset + 42);
    const filename = bytes.subarray(centralOffset + 46, centralOffset + 46 + filenameLength).toString("utf8");
    if (filename === "word/document.xml") {
      documentEntry = { method, compressedSize, localOffset };
      break;
    }
    centralOffset += 46 + filenameLength + extraLength + commentLength;
  }
  if (!documentEntry) throw new Error("The DOCX document text was not found.");
  const { localOffset, method, compressedSize } = documentEntry;
  if (bytes.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("The DOCX document entry is invalid.");
  const filenameLength = bytes.readUInt16LE(localOffset + 26);
  const extraLength = bytes.readUInt16LE(localOffset + 28);
  const contentOffset = localOffset + 30 + filenameLength + extraLength;
  const compressed = bytes.subarray(contentOffset, contentOffset + compressedSize);
  const xmlBytes = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed, { maxOutputLength: 8 * 1024 * 1024 }) : null;
  if (!xmlBytes) throw new Error("The DOCX uses an unsupported compression format.");
  const xml = xmlBytes.toString("utf8")
    .replace(/<w:tab\b[^>]*\/?\s*>/g, "\t")
    .replace(/<w:br\b[^>]*\/?\s*>/g, " ")
    .replace(/<\/w:tc>/g, "\t")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:p>/g, " ")
    .replace(/<[^>]+>/g, "");
  return decodeXmlText(xml).replace(/ +/g, " ").replace(/ *\n */g, "\n").trim();
}

export async function normalizeAnswerKeyDocument(buffer, filename = "", layout = null, grading = null) {
  const extension = String(filename).toLowerCase().split(".").pop();
  if (["json", "csv", "txt"].includes(extension)) return normalizeAnswerKey(buffer, filename);
  if (extension === "docx") {
    try {
      const text = extractDocxText(buffer);
      const parsed = parseCsv(text) || parseAnswerKey(Buffer.from(text), "answer-key.txt");
      return normalizeParsedAnswerKey(parsed);
    } catch (error) {
      console.warn("Could not extract answer key DOCX text:", error.message);
      return null;
    }
  }
  if (extension !== "pdf") return null;
  try {
    return await normalizePdfAnswerKey(Buffer.from(buffer), layout, grading);
  } catch (error) {
    console.warn("Could not extract answer key PDF text:", error.message);
    return null;
  }
}

function gcd(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a || 1n;
}

function rational(numerator, denominator = 1n) {
  if (!denominator) throw new Error("Division by zero.");
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function numericRational(value) {
  const source = normalizeAnswer(value);
  if (!source || source.length > 240) return null;
  const tokens = source.match(/\d+(?:\.\d*)?|\.\d+|[()+*/-]/g);
  if (!tokens || tokens.join("") !== source) return null;
  let index = 0;

  function atom() {
    const token = tokens[index++];
    if (token === "+") return atom();
    if (token === "-") {
      const value = atom();
      return rational(-value.numerator, value.denominator);
    }
    if (token === "(") {
      const value = expression();
      if (tokens[index++] !== ")") throw new Error("Unclosed parenthesis.");
      return value;
    }
    if (!token || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) throw new Error("Invalid number.");
    const [whole = "0", fraction = ""] = token.split(".");
    return rational(BigInt((whole || "0") + fraction), 10n ** BigInt(fraction.length));
  }

  function product() {
    let value = atom();
    while (tokens[index] === "*" || tokens[index] === "/") {
      const operator = tokens[index++];
      const right = atom();
      value = operator === "*"
        ? rational(value.numerator * right.numerator, value.denominator * right.denominator)
        : rational(value.numerator * right.denominator, value.denominator * right.numerator);
    }
    return value;
  }

  function expression() {
    let value = product();
    while (tokens[index] === "+" || tokens[index] === "-") {
      const operator = tokens[index++];
      const right = product();
      const rightNumerator = operator === "+" ? right.numerator : -right.numerator;
      value = rational(
        value.numerator * right.denominator + rightNumerator * value.denominator,
        value.denominator * right.denominator
      );
    }
    return value;
  }

  try {
    const value = expression();
    return index === tokens.length ? value : null;
  } catch {
    return null;
  }
}

function normalizeAnswer(value) {
  let normalized = String(value ?? "")
    .normalize("NFKC")
    .replace(/\u2044/g, "/")
    .toLocaleLowerCase("vi")
    .replace(/[\u2212\u2013\u2014]/g, "-")
    .replace(/[\u00d7\u00b7\u22c5]/g, "*")
    .replace(/\u00f7/g, "/")
    .replace(/\\(?:d?frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)")
    .replace(/\\(?:cdot|times)/g, "*")
    .replace(/\\div/g, "/")
    .replace(/\\(?:left|right)/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (/^\d+,\d+$/.test(normalized)) normalized = normalized.replace(",", ".");
  const booleanText = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u0110\u0111]/g, "d");
  if (["dung", "true"].includes(booleanText)) return "true";
  if (["sai", "false"].includes(booleanText)) return "false";
  return normalized;
}

function answersMatch(expected, submitted, answerType = "") {
  const normalizedExpected = normalizeAnswer(expected);
  const normalizedSubmitted = normalizeAnswer(submitted);
  if (normalizedExpected !== "" && normalizedExpected === normalizedSubmitted) return true;
  if (answerType === "true_false") {
    const normalizeBooleanLetter = value => {
      const normalized = String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("vi")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u0110\u0111]/g, "d");
      if (["d", "dung", "true", "t", "yes", "y"].includes(normalized)) return "true";
      if (["s", "sai", "false", "f", "no", "n"].includes(normalized)) return "false";
      return normalized;
    };
    const booleanExpected = normalizeBooleanLetter(expected);
    if (booleanExpected !== "" && booleanExpected === normalizeBooleanLetter(submitted)) return true;
  }
  const expectedNumber = numericRational(expected);
  const submittedNumber = numericRational(submitted);
  return Boolean(expectedNumber && submittedNumber
    && expectedNumber.numerator === submittedNumber.numerator
    && expectedNumber.denominator === submittedNumber.denominator);
}

function normalizeQuestionKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0110\u0111]/g, "d")
    .toLocaleLowerCase("vi")
    .replace(/[^a-z0-9]/g, "");
}

function sectionQuestionAliases(section, questionNumber, statementId = "") {
  const number = String(questionNumber);
  const sectionId = String(section.sectionId || section.order || "");
  const order = String(section.order || "");
  const bases = [
    `${sectionId}-${number}`, `${sectionId}.${number}`, `${sectionId}_${number}`, `${sectionId}:${number}`, `${sectionId}${number}`,
    `part${order}-${number}`, `part${order}question${number}`, `section${sectionId}question${number}`,
    `section${order}question${number}`, `phan${sectionId}cau${number}`, `phan${order}cau${number}`,
    `phan${sectionId}${number}`, `phan${order}${number}`,
    `cau${sectionId}${number}`, `cau${order}${number}`, `q${number}`, `cau${number}`, number
  ];
  if (!statementId) return bases.flatMap(base => [base, `Câu ${base}`]);
  const letter = String(statementId).toLowerCase();
  return bases.flatMap(base => [
    `${base}${letter}`, `${base}.${letter}`, `${base}-${letter}`, `${base}_${letter}`, `${base}:${letter}`,
    `${number}${letter}`, `${number}.${letter}`, `${number}-${letter}`, `${number}_${letter}`,
    `Câu ${base}${letter}`
  ]);
}

function sequentialQuestionAliases(questionNumber, statementId = "") {
  const number = String(questionNumber);
  if (!statementId) return [number, `q${number}`, `cau${number}`, `question${number}`];
  const letter = String(statementId).toLowerCase();
  return [`${number}${letter}`, `${number}.${letter}`, `${number}-${letter}`, `${number}_${letter}`,
    `q${number}${letter}`, `cau${number}${letter}`, `question${number}${letter}`];
}

function resolveAnswer(source, aliases, usedKeys = new Set()) {
  const normalizedAliases = aliases.map(normalizeQuestionKey);
  for (const alias of normalizedAliases) {
    const key = Object.keys(source).find(candidate => !usedKeys.has(candidate) && normalizeQuestionKey(candidate) === alias);
    if (key != null) return { key, value: source[key] };
  }
  return null;
}

function gradeConfiguredAnswers(answerKey, submittedAnswers, layout, grading) {
  const sections = layout.sections.filter(section => section && Number(section.count) > 0);
  if (!sections.length || !sections.some(section => section.grading)) return null;

  const usedAnswerKeys = new Set();
  const usedSubmittedKeys = new Set();
  const results = [];
  const missingAnswerIds = [];
  let totalPoints = 0;
  let earnedPoints = 0;
  let correctCount = 0;
  let questionCount = 0;
  let precedingQuestionCount = 0;

  for (const section of sections) {
    const criteria = section.grading || {};
    const questionTotal = Math.floor(Number(section.count));
    const statementIds = section.type === "true_false"
      ? (section.statements || ["a", "b", "c", "d"]).map(String)
      : [];

    for (let questionNumber = 1; questionNumber <= questionTotal; questionNumber++) {
      questionCount++;
      const sequentialNumber = precedingQuestionCount + questionNumber;
      const baseAliases = [
        ...sectionQuestionAliases(section, questionNumber),
        ...sequentialQuestionAliases(sequentialNumber)
      ];
      const questionId = `${section.sectionId || section.order}-${questionNumber}`;

      if (section.type === "true_false") {
        const subResults = statementIds.map(statementId => {
          const aliases = [
            ...sectionQuestionAliases(section, questionNumber, statementId),
            ...sequentialQuestionAliases(sequentialNumber, statementId)
          ];
          const expected = resolveAnswer(answerKey.answers, aliases, usedAnswerKeys);
          const submitted = resolveAnswer(submittedAnswers, aliases, usedSubmittedKeys);
          if (expected) usedAnswerKeys.add(expected.key);
          else missingAnswerIds.push(aliases[0]);
          if (submitted) usedSubmittedKeys.add(submitted.key);
          const accepted = expected ? (Array.isArray(expected.value) ? expected.value : [expected.value]) : [];
          const correct = accepted.some(value => answersMatch(value, submitted?.value ?? "", section.type));
          return { statement: statementId, correct };
        });
        const correctStatements = subResults.filter(item => item.correct).length;
        const pointsByCorrectCount = criteria.pointsByCorrectStatements || {};
        const points = Number(pointsByCorrectCount[String(correctStatements)] || 0);
        const maximum = Number(pointsByCorrectCount[String(statementIds.length)] || 0);
        totalPoints += maximum;
        earnedPoints += points;
        const correct = correctStatements === statementIds.length;
        if (correct) correctCount++;
        results.push({
          question: questionId,
          type: section.type,
          correct,
          correctStatements,
          statementCount: statementIds.length,
          statements: subResults,
          earnedPoints: points,
          totalPoints: maximum
        });
        continue;
      }

      const expected = resolveAnswer(answerKey.answers, baseAliases, usedAnswerKeys);
      const submitted = resolveAnswer(submittedAnswers, baseAliases, usedSubmittedKeys);
      if (expected) usedAnswerKeys.add(expected.key);
      else missingAnswerIds.push(baseAliases[0]);
      if (submitted) usedSubmittedKeys.add(submitted.key);
      const accepted = expected ? (Array.isArray(expected.value) ? expected.value : [expected.value]) : [];
      const correct = accepted.some(value => answersMatch(value, submitted?.value ?? ""));
      const points = Number(criteria.pointsPerCorrect || 0);
      totalPoints += points;
      if (correct) {
        earnedPoints += points;
        correctCount++;
      }
      results.push({ question: questionId, type: section.type, correct, earnedPoints: correct ? points : 0, totalPoints: points });
    }
    precedingQuestionCount += questionTotal;
  }

  const roundedEarned = Math.round(earnedPoints * 100) / 100;
  const roundedTotal = Math.round(totalPoints * 100) / 100;
  const scale = Number(grading.scale) > 0 ? Number(grading.scale) : roundedTotal;
  return {
    score: roundedEarned,
    scale,
    earnedPoints: roundedEarned,
    totalPoints: roundedTotal,
    percent: roundedTotal ? Math.round(roundedEarned / roundedTotal * 100) : 0,
    correctCount,
    questionCount,
    completeAnswerKey: missingAnswerIds.length === 0,
    missingAnswerCount: missingAnswerIds.length,
    missingAnswerIds,
    results
  };
}

export function gradeAnswers(answerKey, submittedAnswers = {}, options = {}) {
  if (!answerKey?.answers || typeof answerKey.answers !== "object") {
    throw new Error("The answer key is not in a supported structured format.");
  }
  if (options.layout?.sections && options.grading) {
    const configured = gradeConfiguredAnswers(answerKey, submittedAnswers, options.layout, options.grading);
    if (configured) return configured;
  }
  const questions = Object.entries(answerKey.answers);
  let totalPoints = 0;
  let earnedPoints = 0;
  const results = questions.map(([question, expected]) => {
    const points = Number(answerKey.points?.[question]) > 0 ? Number(answerKey.points[question]) : 1;
    const accepted = Array.isArray(expected) ? expected : [expected];
    const submitted = submittedAnswers?.[question] ?? "";
    const correct = accepted.some((value) => answersMatch(value, submitted));
    totalPoints += points;
    if (correct) earnedPoints += points;
    return { question, correct, earnedPoints: correct ? points : 0, totalPoints: points };
  });
  return {
    earnedPoints,
    totalPoints,
    percent: totalPoints ? Math.round(earnedPoints / totalPoints * 100) : 0,
    correctCount: results.filter((result) => result.correct).length,
    questionCount: results.length,
    results
  };
}
