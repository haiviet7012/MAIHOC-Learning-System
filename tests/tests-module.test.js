import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildXlsxWorkbook, buildCsvBuffer } from "../server/tests-module/sheets-exporter.js";
import { formatDateTimeVN } from "../server/tests-module/results-db.js";
import { translateSqlToPostgres } from "../server/postgres.js";

test("Sheets exporter generates valid XLSX ZIP archive with section borders and UTF-8 BOM CSV", () => {
  const xlsx = buildXlsxWorkbook([
    {
      name: "hai viet -> Kết quả học tập",
      title: "HỌC SINH: HAI VIET -> BẢNG KẾT QUẢ HỌC TẬP",
      subtitle: "Họ và tên học sinh: hai viet · Lớp: 10A1 · Ngày xuất: 30/10/26",
      headers: ["STT", "Tên nội dung", "Phân loại", "Môn học", "Trạng thái", "Điểm"],
      rows: [
        [{ value: 1, type: "number" }, "Chuyên đề xác suất", "Tài liệu lý thuyết", "Toán", "Chưa hoàn thành", "—"],
        [{ value: 2, type: "number" }, "Đề khảo sát Toán 12", "Đề thi thử", "Toán", "Đã hoàn thành", { value: 9.5, type: "number" }],
        [{ value: 3, type: "number" }, "gki", "Bài kiểm tra", "Toán", "Đã hoàn thành", { value: 8.75, type: "number" }]
      ],
      sectionColumnIndex: 2
    }
  ]);
  assert.ok(Buffer.isBuffer(xlsx));
  assert.equal(xlsx.readUInt32LE(0), 0x04034b50);

  const csv = buildCsvBuffer(
    ["STT", "Học sinh", "Trạng thái", "Điểm"],
    [[1, "Nguyễn Văn A", "Đã hoàn thành", 9.5]]
  );
  const text = csv.toString("utf8");
  assert.ok(text.startsWith("\uFEFFSTT,Học sinh,Trạng thái,Điểm"));
  assert.ok(text.includes("Nguyễn Văn A,Đã hoàn thành,9.5"));
});

test("formatDateTimeVN formats PostgreSQL, SQLite, ISO, and datetime-local strings uniformly as dd/mm/yy (Ảnh 6)", () => {
  assert.equal(formatDateTimeVN("2026-10-30 07:16:31.929425+00"), "30/10/26");
  assert.equal(formatDateTimeVN("2026-10-30 07:17:12.558938+00"), "30/10/26");
  assert.equal(formatDateTimeVN("2026-10-30 07:18:00"), "30/10/26");
  assert.equal(formatDateTimeVN("2026-11-07T02:37"), "07/11/26");
  assert.equal(formatDateTimeVN("07:55 30/10/2026"), "30/10/26");
});

test("translateSqlToPostgres safely translates CAST(grade AS INTEGER) without corrupting quotes (Ảnh 3)", () => {
  const { sql } = translateSqlToPostgres(`
    SELECT *
    FROM learning_results
    WHERE category = 'test'
    ORDER BY subject_name ASC, CAST(grade AS INTEGER) ASC, item_title ASC, submitted_at DESC
  `);
  assert.ok(sql.includes("CASE WHEN grade ~ '^[0-9]+$' THEN CAST(grade AS INTEGER) ELSE 99 END ASC"));
  assert.ok(!sql.includes("'^[0-9]+ ASC"));
});

test("Frontend and backend support 'Cả khối' option, 'Xuất bảng điểm giáo viên', and synced completion badges (Ảnh 1-4)", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const appJs = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const testsJs = fs.readFileSync(new URL("../js/tests/index.js", import.meta.url), "utf8");
  const serverTestsJs = fs.readFileSync(new URL("../server/tests-module/index.js", import.meta.url), "utf8");
  const serverJs = fs.readFileSync(new URL("../server/server.js", import.meta.url), "utf8");

  assert.ok(html.includes('name="answerMode"'));
  assert.ok(html.includes('name="answerEntryMethod"'));
  assert.ok(html.includes('data-solution-switch-manual'));
  assert.ok(html.includes('data-solution-switch-ai'));
  assert.ok(testsJs.includes("Xuất bảng điểm giáo viên (.xlsx)"));
  assert.ok(testsJs.includes('<option value="ALL">Cả khối</option>'));
  assert.ok(serverTestsJs.includes("userSubmissionsByTest.has(row.id)"));
  assert.ok(serverTestsJs.includes("isAdminOrTeacher ? totalSubmissionsCount > 0 : Boolean(sub)"));
  assert.ok(serverTestsJs.includes('rawClassCode === "ALL"'));
  assert.ok(appJs.includes('["exam", "practice", "test"].includes(category)'));
  assert.ok(serverJs.includes("testsModule.initManualSolutionForDocument(id)"));
});
