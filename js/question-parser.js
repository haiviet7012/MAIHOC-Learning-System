function normalizeForClassification(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\u0110\u0111]/g, "d")
        .toLowerCase();
}

export async function extractDocxText(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const signature = 0x06054b50;
    const minOffset = Math.max(0, bytes.length - 0xffff - 22);
    let directoryEnd = -1;
    for (let offset = bytes.length - 22; offset >= minOffset; offset--) {
        if (view.getUint32(offset, true) === signature) {
            directoryEnd = offset;
            break;
        }
    }
    if (directoryEnd < 0) throw new Error("Invalid DOCX archive.");

    const entryCount = view.getUint16(directoryEnd + 10, true);
    let centralOffset = view.getUint32(directoryEnd + 16, true);
    const decoder = new TextDecoder("utf-8");
    let documentEntry = null;
    for (let index = 0; index < entryCount; index++) {
        if (view.getUint32(centralOffset, true) !== 0x02014b50) throw new Error("Invalid DOCX directory.");
        const method = view.getUint16(centralOffset + 10, true);
        const compressedSize = view.getUint32(centralOffset + 20, true);
        const filenameLength = view.getUint16(centralOffset + 28, true);
        const extraLength = view.getUint16(centralOffset + 30, true);
        const commentLength = view.getUint16(centralOffset + 32, true);
        const localOffset = view.getUint32(centralOffset + 42, true);
        const filename = decoder.decode(bytes.subarray(centralOffset + 46, centralOffset + 46 + filenameLength));
        if (filename === "word/document.xml") {
            documentEntry = { method, compressedSize, localOffset };
            break;
        }
        centralOffset += 46 + filenameLength + extraLength + commentLength;
    }
    if (!documentEntry) throw new Error("DOCX document text was not found.");

    const localOffset = documentEntry.localOffset;
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("Invalid DOCX document entry.");
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataOffset, dataOffset + documentEntry.compressedSize);
    let xmlBytes;
    if (documentEntry.method === 0) {
        xmlBytes = compressed;
    } else if (documentEntry.method === 8 && typeof DecompressionStream !== "undefined") {
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        xmlBytes = new Uint8Array(await new Response(stream).arrayBuffer());
    } else {
        throw new Error("This browser cannot extract this DOCX compression format.");
    }

    const xml = new DOMParser().parseFromString(decoder.decode(xmlBytes), "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("Invalid DOCX document XML.");
    const wordNamespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    return Array.from(xml.getElementsByTagNameNS(wordNamespace, "p"), paragraph =>
        Array.from(paragraph.getElementsByTagNameNS(wordNamespace, "t"), part => part.textContent || "").join("")
    ).join("\n");
}

function findLabeledItems(text, pattern) {
    const matches = [...text.matchAll(pattern)];
    return matches.map((match, index) => {
        const start = match.index + match[0].length;
        const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
        return {
            id: match[1].toUpperCase(),
            start: match.index,
            text: text.slice(start, end).trim().replace(/\s+/g, " ")
        };
    }).filter(item => item.text);
}

export function parseQuestionText(source) {
    const text = String(source || "").replace(/\u00a0/g, " ").replace(/[\t\r\n]+/g, " ").replace(/\s+/g, " ").trim();
    if (!text) return [];

    const headings = [...text.matchAll(/\b(?:c\u00e2u|cau|b\u00e0i|bai|question|q)\s*(\d+)\s*[.:)]/giu)]
        .filter(heading => !/\b(?:den|toi)\s*$/.test(normalizeForClassification(text.slice(Math.max(0, heading.index - 36), heading.index))));
    if (!headings.length) return [];
    const sectionMatches = [...text.matchAll(/\b(?:ph\u1ea7n|phan)\s+(i{1,3}|iv|v|vi|vii|viii|ix|x|\d+)\b/giu)];
    const romanNumbers = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
    const sections = sectionMatches.map((match, index) => {
        const token = match[1].toUpperCase();
        const nextSection = sectionMatches[index + 1]?.index ?? text.length;
        const firstQuestion = headings.find(heading => heading.index > match.index && heading.index < nextSection);
        const introEnd = Math.min(match.index + 1400, firstQuestion?.index ?? nextSection);
        const number = /^\d+$/.test(token) ? Number(token) : romanNumbers[token];
        return {
            id: token,
            key: token,
            index: match.index,
            order: number || index + 1,
            kind: classifySection(text.slice(match.index, introEnd))
        };
    });

    const sectionKinds = new Map();
    for (const section of sections) {
        if (section.kind) sectionKinds.set(section.key, section.kind);
    }
    const sectionAt = position => {
        for (let index = sections.length - 1; index >= 0; index--) {
            if (sections[index].index < position) {
                return { ...sections[index], kind: sectionKinds.get(sections[index].key) || sections[index].kind };
            }
        }
        return null;
    };
    const romanOrder = section => section ? section.order : Number.MAX_SAFE_INTEGER;
    const candidates = [];
    for (let index = 0; index < headings.length; index++) {
        const heading = headings[index];
        const sourceId = String(Number(heading[1]));
        const section = sectionAt(heading.index);
        const start = heading.index + heading[0].length;
        const end = headings[index + 1]?.index ?? text.length;
        const body = text.slice(start, end).trim();
        const options = findLabeledItems(body, /(?:^|\s)([A-D])\s*[).]\s*/gu);
        const statements = findLabeledItems(body, /(?:^|\s)([a-d])\s*[).]\s*/gu)
            .map(item => ({ ...item, id: item.id.toLowerCase() }));
        const normalized = normalizeForClassification(body);
        const trueFalseInstruction = /dung\s*(?:\/|hay|va)?\s*sai/.test(normalized)
            || /danh gia.*dung.*sai/.test(normalized);
        const shortAnswerInstruction = /tra loi ngan|tu luan|dien dap an/.test(normalized);

        let type;
        if (section?.kind === "true_false" || (!section?.kind && trueFalseInstruction && statements.length)) {
            type = "true_false";
        } else if (section?.kind === "short_answer" || (!section?.kind && shortAnswerInstruction)) {
            type = "essay";
        } else if (section?.kind === "multiple_choice" || options.length >= 2) {
            type = "multiple_choice";
        } else if (trueFalseInstruction && statements.length) {
            type = "true_false";
        } else {
            type = "essay";
        }

        const questionOptions = type === "multiple_choice" && section?.kind === "multiple_choice"
            ? ["A", "B", "C", "D"].map(id => ({ id, text: "" }))
            : options;
        const questionStatements = type === "true_false"
            ? (statements.length ? statements : ["a", "b", "c", "d"].map(id => ({ id, text: "" })))
            : [];
        const candidate = {
            sourceId,
            section,
            type,
            body,
            text: type === "multiple_choice" && options.length ? body.slice(0, options[0].start).trim() : body,
            options: questionOptions,
            statements: questionStatements,
            documentOrder: index,
            quality: Math.min(body.length, 500) + options.length * 100 + statements.length * 120
        };
        const duplicateKey = section ? `${section.key}:${sourceId}` : null;
        if (duplicateKey) {
            const priorIndex = candidates.findIndex(item => item.duplicateKey === duplicateKey);
            if (priorIndex >= 0) {
                candidate.duplicateKey = duplicateKey;
                if (candidate.quality > candidates[priorIndex].quality) candidates[priorIndex] = candidate;
                continue;
            }
        }
        candidate.duplicateKey = duplicateKey;
        candidates.push(candidate);
    }

    const numberCounts = new Map();
    for (const question of candidates) numberCounts.set(question.sourceId, (numberCounts.get(question.sourceId) || 0) + 1);
    return candidates.map((question, index) => {
        const sectionId = question.section?.id || "";
        const id = numberCounts.get(question.sourceId) > 1
            ? `${sectionId || `Q${index + 1}`}-${question.sourceId}`
            : question.sourceId;
        const label = `${sectionId ? `Ph\u1ea7n ${sectionId} \u00b7 ` : ""}C\u00e2u ${question.sourceId}`;
        return {
            id,
            number: question.sourceId,
            sectionId,
            sectionOrder: romanOrder(question.section),
            type: question.type,
            label,
            text: question.text,
            options: question.options,
            statements: question.statements,
            documentOrder: question.documentOrder
        };
    }).sort((left, right) => left.sectionOrder - right.sectionOrder
        || Number(left.number) - Number(right.number)
        || left.documentOrder - right.documentOrder);
}

const VALID_QUESTION_TYPES = new Set(["multiple_choice", "true_false", "essay"]);

function compareQuestionOrder(left, right) {
    return Number(left.documentOrder ?? Number.MAX_SAFE_INTEGER) - Number(right.documentOrder ?? Number.MAX_SAFE_INTEGER)
        || Number(left.number || left.id) - Number(right.number || right.id);
}

function compareConfiguredOrder(left, right) {
    const leftNumber = Number.parseFloat(left.number || left.id);
    const rightNumber = Number.parseFloat(right.number || right.id);
    const numberOrder = Number.isFinite(leftNumber) && Number.isFinite(rightNumber) ? leftNumber - rightNumber : 0;
    return left.layoutSectionOrder - right.layoutSectionOrder || numberOrder || compareQuestionOrder(left, right);
}

/** Apply a configured layout to parsed questions; assessment screens call this explicitly. */
export function applyQuestionLayout(questions, layout, { fillMissing = true } = {}) {
    if (!Array.isArray(layout?.sections) || !layout.sections.length) {
        return Array.isArray(questions) ? questions : [];
    }

    const sections = layout.sections
        .filter(section => VALID_QUESTION_TYPES.has(section.type) && Number(section.count) > 0)
        .map((section, index) => ({ ...section, order: Number(section.order) || index + 1, count: Math.floor(Number(section.count)) }));
    if (!sections.length) return Array.isArray(questions) ? questions : [];

    const source = (Array.isArray(questions) ? questions : []).map((question, index) => ({
        ...question,
        documentOrder: Number.isFinite(Number(question.documentOrder)) ? Number(question.documentOrder) : index
    })).sort(compareQuestionOrder);
    const hasSectionMetadata = source.some(question => Number.isFinite(Number(question.sectionOrder))
        && Number(question.sectionOrder) < Number.MAX_SAFE_INTEGER);

    const used = new Set();
    const normalized = [];

    if (!hasSectionMetadata) {
        let cursor = 0;
        for (const section of sections) {
            const slice = source.slice(cursor, cursor += section.count);
            for (const [index, question] of slice.entries()) {
                used.add(question);
                normalized.push(questionWithConfiguredSection(question, section, index + 1));
            }
        }
    } else {
        for (const section of sections) {
            const matching = source.filter(question => !used.has(question)
                && Number(question.sectionOrder) === section.order)
                .sort(compareQuestionOrder)
                .slice(0, section.count);
            for (const [index, question] of matching.entries()) {
                used.add(question);
                normalized.push(questionWithConfiguredSection(question, section, index + 1));
            }
        }
    }

    // Place any remaining unused questions into any slots left by the parser.
    const leftovers = source.filter(question => !used.has(question)).sort(compareQuestionOrder);
    let fallbackIndex = 0;
    for (const section of sections) {
        const present = normalized.filter(question => question.layoutSectionOrder === section.order).length;
        const missing = Math.max(0, section.count - present);
        for (const [index, question] of leftovers.slice(fallbackIndex, fallbackIndex + missing).entries()) {
            used.add(question);
            normalized.push(questionWithConfiguredSection(question, section, present + index + 1));
        }
        fallbackIndex += missing;
    }

    if (fillMissing) {
        for (const section of sections) {
            const present = normalized.filter(question => question.layoutSectionOrder === section.order).length;
            const sectionId = String(section.sectionId || section.order);
            for (let localNum = present + 1; localNum <= section.count; localNum++) {
                normalized.push(questionWithConfiguredSection({
                    id: `${sectionId}-${localNum}`,
                    number: String(localNum),
                    text: `Câu ${localNum}`,
                    options: [],
                    statements: [],
                    documentOrder: normalized.length
                }, section, localNum));
            }
        }
    }

    return normalized.sort(compareConfiguredOrder);
}

function questionWithConfiguredSection(question, section, localQuestionNumber) {
    const sectionId = String(section.sectionId || section.order);
    const localNum = String(localQuestionNumber || question.number || 1);
    const normalized = {
        ...question,
        id: `${sectionId}-${localNum}`,
        number: localNum,
        answerId: `${sectionId}-${localNum}`,
        type: section.type,
        layoutSectionOrder: section.order,
        layoutSectionTitle: section.title || ""
    };
    if (section.type === "multiple_choice") {
        normalized.options = (section.options || question.options?.map(option => option.id) || ["A", "B", "C", "D"])
            .map(id => ({ id: String(id), text: "" }));
    }
    if (section.type === "true_false") {
        normalized.statements = (section.statements || question.statements?.map(statement => statement.id) || ["a", "b", "c", "d"])
            .map(id => ({ id: String(id), text: "" }));
    }
    return normalized;
}

function classifySection(source) {
    const normalized = normalizeForClassification(source);
    if (/tra loi ngan|dien dap an|tu luan/.test(normalized)) return "short_answer";
    if (/dung\s*(?:\/|hay|va)?\s*sai|danh gia.*dung.*sai/.test(normalized)) return "true_false";
    if (/trac nghiem|nhieu phuong an|chon mot phuong an/.test(normalized)) return "multiple_choice";
    return null;
}

export function questionSummary(questions) {
    const counts = { multiple_choice: 0, true_false: 0, essay: 0 };
    for (const question of questions) counts[question.type] = (counts[question.type] || 0) + 1;
    const total = questions.length;
    if (!total) return "Chưa đọc được cấu trúc câu hỏi trong tệp.";
    return `${total} câu · ${counts.multiple_choice} trắc nghiệm · ${counts.true_false} đúng/sai · ${counts.essay} tự luận`;
}