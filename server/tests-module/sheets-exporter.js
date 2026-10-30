import { deflateRawSync } from "node:zlib";

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnLetter(colIndex) {
  let temp = colIndex + 1;
  let letter = "";
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter;
}

function sanitizeSheetName(name, fallback = "Sheet") {
  const cleaned = String(name || fallback)
    .replace(/[\\/?*:[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);
  return cleaned || fallback;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZipBuffer(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const rawData = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), "utf8");
    const crc = crc32(rawData);
    const compressed = deflateRawSync(rawData);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(rawData.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(rawData.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

function extractCellText(cell) {
  if (cell && typeof cell === "object" && "value" in cell) {
    return String(cell.value ?? "").trim();
  }
  return String(cell ?? "").trim();
}

function buildWorksheetXml({ title, subtitle, headers, rows, sectionColumnIndex }) {
  const effectiveSectionCol =
    typeof sectionColumnIndex === "number"
      ? sectionColumnIndex
      : headers.findIndex((h) => /^Phân loại$/i.test(String(h || "").trim()));

  const colWidths = headers.map((h, idx) => {
    let maxLen = String(h || "").length + 4;
    for (const r of rows) {
      const val = r[idx];
      const text = val && typeof val === "object" ? String(val.value ?? "") : String(val ?? "");
      if (text.length + 3 > maxLen) maxLen = text.length + 3;
    }
    return Math.min(48, Math.max(12, maxLen));
  });

  const colsXml = `<cols>${colWidths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("")}</cols>`;

  const sheetRows = [];
  let currentRow = 1;

  if (title) {
    sheetRows.push(
      `<row r="${currentRow}" ht="26" customHeight="1"><c r="A${currentRow}" s="1" t="inlineStr"><is><t>${escapeXml(title)}</t></is></c></row>`
    );
    currentRow++;
  }
  if (subtitle) {
    sheetRows.push(
      `<row r="${currentRow}" ht="19" customHeight="1"><c r="A${currentRow}" s="2" t="inlineStr"><is><t>${escapeXml(subtitle)}</t></is></c></row>`
    );
    currentRow++;
  }
  if (title || subtitle) {
    sheetRows.push(`<row r="${currentRow}" ht="10" customHeight="1"/>`);
    currentRow++;
  }

  const headerCells = headers
    .map((h, colIdx) => {
      const ref = `${columnLetter(colIdx)}${currentRow}`;
      return `<c r="${ref}" s="3" t="inlineStr"><is><t>${escapeXml(h)}</t></is></c>`;
    })
    .join("");
  sheetRows.push(`<row r="${currentRow}" ht="24" customHeight="1">${headerCells}</row>`);
  currentRow++;

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];

    // Determine section border position:
    // 0 = middle row, 1 = section top border, 2 = section bottom border, 3 = single-row section (top + bottom border)
    let sectionBorderPos = 0;
    if (effectiveSectionCol >= 0 && rows.length > 0) {
      const currSec = extractCellText(row[effectiveSectionCol]);
      const prevSec = rowIdx > 0 ? extractCellText(rows[rowIdx - 1][effectiveSectionCol]) : null;
      const nextSec = rowIdx < rows.length - 1 ? extractCellText(rows[rowIdx + 1][effectiveSectionCol]) : null;
      const isFirst = rowIdx === 0 || currSec !== prevSec;
      const isLast = rowIdx === rows.length - 1 || currSec !== nextSec;
      if (isFirst && isLast) sectionBorderPos = 3;
      else if (isFirst) sectionBorderPos = 1;
      else if (isLast) sectionBorderPos = 2;
    } else if (rows.length > 0) {
      const isFirst = rowIdx === 0;
      const isLast = rowIdx === rows.length - 1;
      if (isFirst && isLast) sectionBorderPos = 3;
      else if (isFirst) sectionBorderPos = 1;
      else if (isLast) sectionBorderPos = 2;
    }

    const applyBorderVariant = (baseStyleId) => {
      if (baseStyleId >= 4 && baseStyleId <= 8 && sectionBorderPos > 0) {
        return baseStyleId + sectionBorderPos * 5;
      }
      return baseStyleId;
    };

    const cells = row
      .map((cell, colIdx) => {
        const ref = `${columnLetter(colIdx)}${currentRow}`;
        const raw = cell && typeof cell === "object" && "value" in cell ? cell.value : cell;
        const explicitStyle = cell && typeof cell === "object" ? cell.style : null;
        const explicitType = cell && typeof cell === "object" ? cell.type : null;

        if (raw === null || raw === undefined || raw === "") {
          const st = applyBorderVariant(explicitStyle || 4);
          return `<c r="${ref}" s="${st}" t="inlineStr"><is><t>—</t></is></c>`;
        }

        if ((explicitType === "number" || typeof raw === "number") && Number.isFinite(Number(raw))) {
          const num = Number(raw);
          const baseStyleId = explicitStyle || (Number.isInteger(num) ? 5 : 6);
          const st = applyBorderVariant(baseStyleId);
          return `<c r="${ref}" s="${st}" t="n"><v>${num}</v></c>`;
        }

        const str = String(raw);
        let baseStyleId = explicitStyle || 4;
        if (!explicitStyle) {
          if (/^(Đã hoàn thành|Hoàn thành|Đã chấm)$/i.test(str)) baseStyleId = 7;
          else if (/^(Chưa hoàn thành|Đang chờ chấm|Chờ chấm)$/i.test(str)) baseStyleId = 8;
        }
        const st = applyBorderVariant(baseStyleId);
        return `<c r="${ref}" s="${st}" t="inlineStr"><is><t>${escapeXml(str)}</t></is></c>`;
      })
      .join("");
    sheetRows.push(`<row r="${currentRow}" ht="21" customHeight="1">${cells}</row>`);
    currentRow++;
  }

  const lastCol = columnLetter(Math.max(0, headers.length - 1));
  const mergeXml = (title || subtitle) && headers.length > 1
    ? `<mergeCells count="${(title ? 1 : 0) + (subtitle ? 1 : 0)}">
        ${title ? `<mergeCell ref="A1:${lastCol}1"/>` : ""}
        ${subtitle ? `<mergeCell ref="A${title ? 2 : 1}:${lastCol}${title ? 2 : 1}"/>` : ""}
      </mergeCells>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  ${colsXml}
  <sheetData>${sheetRows.join("")}</sheetData>
  ${mergeXml}
</worksheet>`;
}

function buildDataCellXfsForBorder(borderId) {
  return [
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="${borderId}" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>`,
    `<xf numFmtId="1" fontId="0" fillId="0" borderId="${borderId}" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>`,
    `<xf numFmtId="164" fontId="0" fillId="0" borderId="${borderId}" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>`,
    `<xf numFmtId="0" fontId="4" fillId="4" borderId="${borderId}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`,
    `<xf numFmtId="0" fontId="5" fillId="5" borderId="${borderId}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`
  ].join("\n    ");
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="0.00"/>
  </numFmts>
  <fonts count="6">
    <font><sz val="11"/><color rgb="FF172B45"/><name val="Arial"/></font>
    <font><b/><sz val="15"/><color rgb="FF123B70"/><name val="Arial"/></font>
    <font><i/><sz val="10"/><color rgb="FF65758B"/><name val="Arial"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
    <font><b/><sz val="11"/><color rgb="FF16815C"/><name val="Arial"/></font>
    <font><b/><sz val="11"/><color rgb="FFD97706"/><name val="Arial"/></font>
  </fonts>
  <fills count="6">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF123B70"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEAF1FB"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE6F6EE"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="5">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FF94A3B8"/></left>
      <right style="thin"><color rgb="FF94A3B8"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
      <diagonal/>
    </border>
    <border>
      <left style="thin"><color rgb="FF94A3B8"/></left>
      <right style="thin"><color rgb="FF94A3B8"/></right>
      <top style="medium"><color rgb="FF123B70"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
      <diagonal/>
    </border>
    <border>
      <left style="thin"><color rgb="FF94A3B8"/></left>
      <right style="thin"><color rgb="FF94A3B8"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="medium"><color rgb="FF123B70"/></bottom>
      <diagonal/>
    </border>
    <border>
      <left style="thin"><color rgb="FF94A3B8"/></left>
      <right style="thin"><color rgb="FF94A3B8"/></right>
      <top style="medium"><color rgb="FF123B70"/></top>
      <bottom style="medium"><color rgb="FF123B70"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="24">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="4" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    ${buildDataCellXfsForBorder(1)}
    ${buildDataCellXfsForBorder(2)}
    ${buildDataCellXfsForBorder(3)}
    ${buildDataCellXfsForBorder(4)}
  </cellXfs>
</styleSheet>`;
}

export function buildXlsxWorkbook(sheets) {
  const validSheets = (Array.isArray(sheets) && sheets.length ? sheets : [{ name: "Sheet1", headers: ["Thông tin"], rows: [["Chưa có dữ liệu"]] }]);
  const usedNames = new Set();
  const normalizedSheets = validSheets.map((s, idx) => {
    let base = sanitizeSheetName(s.name, `Sheet${idx + 1}`);
    let candidate = base;
    let counter = 2;
    while (usedNames.has(candidate.toLowerCase())) {
      const suffix = ` (${counter++})`;
      candidate = base.slice(0, 31 - suffix.length) + suffix;
    }
    usedNames.add(candidate.toLowerCase());
    return { ...s, sheetName: candidate };
  });

  const entries = [
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${normalizedSheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n  ")}
</Types>`
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
    },
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${normalizedSheets.map((s, i) => `<sheet name="${escapeXml(s.sheetName)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("\n    ")}
  </sheets>
</workbook>`
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${normalizedSheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n  ")}
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
    },
    {
      name: "xl/styles.xml",
      data: buildStylesXml()
    }
  ];

  normalizedSheets.forEach((sheet, idx) => {
    entries.push({
      name: `xl/worksheets/sheet${idx + 1}.xml`,
      data: buildWorksheetXml(sheet)
    });
  });

  return buildZipBuffer(entries);
}

export function buildCsvBuffer(headers, rows) {
  const escapeCsvCell = cell => {
    const raw = cell && typeof cell === "object" && "value" in cell ? cell.value : cell;
    const str = raw === null || raw === undefined ? "" : String(raw);
    if (/[",\r\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map(row => row.map(escapeCsvCell).join(","))
  ];
  return Buffer.from("\uFEFF" + lines.join("\r\n"), "utf8");
}
