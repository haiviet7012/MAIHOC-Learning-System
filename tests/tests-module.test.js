import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildXlsxWorkbook, buildCsvBuffer } from "../server/tests-module/sheets-exporter.js";

test("Sheets exporter generates valid XLSX ZIP archive and UTF-8 BOM CSV", () => {
  const xlsx = buildXlsxWorkbook([
    {
      name: "Tổng hợp điểm kiểm tra",
      title: "BẢNG ĐIỂM KIỂM TRA MAI HỌC",
      subtitle: "Môn Toán · Lớp 10",
      headers: ["STT", "Học viên", "Môn học", "Trạng thái", "Điểm"],
      rows: [
        [{ value: 1, type: "number" }, "Nguyễn Văn A", "Toán", "Đã hoàn thành", { value: 9.5, type: "number" }],
        [{ value: 2, type: "number" }, "Lê Thị B", "Toán", "Đang chờ chấm", "Đang chờ chấm"]
      ]
    }
  ]);
  assert.ok(Buffer.isBuffer(xlsx));
  assert.equal(xlsx.readUInt32LE(0), 0x04034b50);

  const csv = buildCsvBuffer(
    ["STT", "Học viên", "Trạng thái", "Điểm"],
    [[1, "Nguyễn Văn A", "Đã hoàn thành", 9.5]]
  );
  const text = csv.toString("utf8");
  assert.ok(text.startsWith("\uFEFFSTT,Học viên,Trạng thái,Điểm"));
  assert.ok(text.includes("Nguyễn Văn A,Đã hoàn thành,9.5"));
});

test("Upload dialog and server support manual answer entry alongside AI solving for practice and mock exams", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const appJs = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const serverJs = fs.readFileSync(new URL("../server/server.js", import.meta.url), "utf8");

  assert.ok(html.includes('name="answerMode"'));
  assert.ok(html.includes('name="answerEntryMethod"'));
  assert.ok(html.includes('data-solution-switch-manual'));
  assert.ok(html.includes('data-solution-switch-ai'));
  assert.ok(appJs.includes('["exam", "practice", "test"].includes(category)'));
  assert.ok(serverJs.includes("testsModule.initManualSolutionForDocument(id)"));
});
