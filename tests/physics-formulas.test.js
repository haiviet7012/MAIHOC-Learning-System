/**
 * tests/physics-formulas.test.js
 * Kiểm thử tự động Thư viện Công thức Vật lý MAIHOC
 */

import test from "node:test";
import assert from "node:assert/strict";
import { PHYSICS_FORMULAS_DATA } from "../js/physics/data/physics-formulas-data.js";
import { mountPhysicsFormulasModule } from "../js/physics/index.js";
import { routeUrl, parseRoute } from "../js/platform/router.js";

test("Physics Formulas: Toàn bộ 3 khối lớp (10, 11, 12) được tải đầy đủ và chính xác", () => {
  assert.ok(PHYSICS_FORMULAS_DATA[10], "Thiếu dữ liệu Lớp 10");
  assert.ok(PHYSICS_FORMULAS_DATA[11], "Thiếu dữ liệu Lớp 11");
  assert.ok(PHYSICS_FORMULAS_DATA[12], "Thiếu dữ liệu Lớp 12");

  assert.equal(PHYSICS_FORMULAS_DATA[10].chapters.length, 4, "Lớp 10 phải có đúng 4 chương");
  assert.equal(PHYSICS_FORMULAS_DATA[11].chapters.length, 4, "Lớp 11 phải có đúng 4 chương");
  assert.equal(PHYSICS_FORMULAS_DATA[12].chapters.length, 4, "Lớp 12 phải có đúng 4 chương");

  assert.equal(PHYSICS_FORMULAS_DATA[10].totalFormulas, 46, "Lớp 10 phải có đúng 46 công thức");
  assert.equal(PHYSICS_FORMULAS_DATA[11].totalFormulas, 42, "Lớp 11 phải có đúng 42 công thức");
  assert.equal(PHYSICS_FORMULAS_DATA[12].totalFormulas, 37, "Lớp 12 phải có đúng 37 công thức");

  const total = PHYSICS_FORMULAS_DATA[10].totalFormulas +
                PHYSICS_FORMULAS_DATA[11].totalFormulas +
                PHYSICS_FORMULAS_DATA[12].totalFormulas;
  assert.equal(total, 125, "Tổng số công thức toàn hệ thống phải bằng đúng 125");
});

test("Physics Formulas: Bảng đơn vị đo lường Hệ SI Lớp 10 có đủ 14 đại lượng chuẩn", () => {
  const siTable = PHYSICS_FORMULAS_DATA[10].siTable;
  assert.ok(Array.isArray(siTable), "Bảng SI phải là mảng");
  assert.equal(siTable.length, 14, "Bảng SI phải chứa đúng 14 đại lượng chuẩn");

  const quantities = siTable.map((item) => item.quantity);
  assert.ok(quantities.some((q) => q.includes("Độ dài")), "Phải có Độ dài");
  assert.ok(quantities.some((q) => q.includes("Khối lượng")), "Phải có Khối lượng");
  assert.ok(quantities.some((q) => q.includes("Thời gian")), "Phải có Thời gian");
  assert.ok(quantities.some((q) => q.includes("Lực")), "Phải có Lực");
  assert.ok(quantities.some((q) => q.includes("Công")), "Phải có Công / Năng lượng");
  assert.ok(quantities.some((q) => q.includes("Áp suất")), "Phải có Áp suất");
});

test("Physics Formulas: Mỗi công thức đều có định danh duy nhất, tiêu đề và biểu thức toán hợp lệ", () => {
  const seenIds = new Set();

  [10, 11, 12].forEach((grade) => {
    const gradeData = PHYSICS_FORMULAS_DATA[grade];
    let gradeCount = 0;

    gradeData.chapters.forEach((ch) => {
      assert.ok(ch.chapterNum, "Chương phải có số hiệu");
      assert.ok(ch.chapterName, "Chương phải có tên");

      ch.subsections.forEach((sub) => {
        assert.ok(sub.title, "Mục con phải có tiêu đề");
        assert.ok(["Trọng tâm", "Mở rộng & Vận dụng", "Chuyên đề"].includes(sub.type), `Loại mục không hợp lệ: ${sub.type}`);

        sub.formulas.forEach((f) => {
          gradeCount++;
          assert.ok(!seenIds.has(f.id), `Trùng lặp mã công thức: ${f.id}`);
          seenIds.add(f.id);

          assert.equal(f.grade, grade, `Sai khối lớp trong công thức ${f.id}`);
          assert.ok(f.title && f.title.trim().length > 0, `Công thức ${f.id} thiếu tiêu đề`);
          assert.ok(f.primaryMath && f.primaryMath.trim().length > 0, `Công thức ${f.id} thiếu biểu thức toán`);
          assert.ok(f.chapterNum, `Công thức ${f.id} thiếu số hiệu chương`);
          assert.ok(f.chapterName, `Công thức ${f.id} thiếu tên chương`);
          assert.ok(f.sectionTitle, `Công thức ${f.id} thiếu tên phân mục`);
        });
      });
    });

    assert.equal(gradeCount, gradeData.totalFormulas, `Số lượng công thức duyệt thực tế (${gradeCount}) khác với khai báo (${gradeData.totalFormulas}) ở Lớp ${grade}`);
  });

  assert.equal(seenIds.size, 125, "Số lượng ID công thức duy nhất phải là 125");
});

test("Physics Formulas: Module export mountPhysicsFormulasModule và hoạt động đúng", () => {
  assert.equal(typeof mountPhysicsFormulasModule, "function", "Phải export hàm mountPhysicsFormulasModule");
});

test("Physics Formulas: Router hỗ trợ route physics-formulas", () => {
  const url = routeUrl({ route: "physics-formulas" });
  assert.equal(url, "/learning/physics-formulas", "Route URL phải là /learning/physics-formulas");

  const parsed = parseRoute(new URL("https://maihoc.edu.vn/learning/physics-formulas"));
  assert.equal(parsed.route, "physics-formulas", "Phải parse đúng route physics-formulas từ URL");
});

