import assert from "node:assert/strict";
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
