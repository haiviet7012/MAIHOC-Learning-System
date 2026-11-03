import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const password = randomUUID(),
  origin = "http://127.0.0.1:4187";
const preview = spawn(process.execPath, ["scripts/dev-preview.mjs"], {
  env: {
    ...process.env,
    PREVIEW_PORT: "4187",
    MAIHOC_PREVIEW_PASSWORD: password,
    MAIHOC_SCHOOL_UPGRADE_ENABLED: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let browser;
try {
  await new Promise((resolve, reject) => {
    let text = "";
    const timer = setTimeout(
      () => reject(new Error("Preview startup timeout")),
      60000,
    );
    preview.stdout.on("data", (c) => {
      text += c;
      if (text.includes("isolated preview ready")) {
        clearTimeout(timer);
        resolve();
      }
    });
    preview.stderr.on("data", (c) => process.stderr.write(c));
    preview.once("exit", (c) => {
      clearTimeout(timer);
      reject(new Error(`Preview exited ${c}`));
    });
  });
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  await mkdir("test-results", { recursive: true });
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["tablet", 1024, 900],
    ["mobile", 390, 844],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      acceptDownloads: true,
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.route(/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr/, (r) =>
      r.abort(),
    );
    await page.goto(origin + "/school/digitize");
    await page
      .getByRole("heading", { name: "Tài khoản dành riêng cho trường học" })
      .waitFor();
    const login = await context.request.post(origin + "/api/auth/login", {
      headers: { Origin: origin },
      data: { email: "student@maihoc.test", password },
    });
    assert.equal(login.status(), 200);
    await page.goto(origin + "/school/digitize");
    await page
      .getByRole("heading", { name: "Số hóa đề AI", exact: true })
      .waitFor();
    const upload = page.locator("[data-doc-upload]");
    await upload.locator("input[name=title]").fill(`Đề thử ${name}`);
    await upload.locator("details").evaluate((x) => (x.open = true));
    await upload
      .locator("textarea[name=manualText]")
      .fill("Một cộng một bằng mấy?");
    await upload.getByRole("button", { name: "Thêm tài liệu" }).click();
    await page.locator("[data-doc-review] textarea[name=stem]").waitFor();
    await page.locator("[data-doc-review] textarea[name=answer]").fill("Hai");
    await page.locator("[data-doc-review] input[name=confirmed]").check();
    await page.getByRole("button", { name: "Lưu bản đối chiếu" }).click();
    await page.getByText("Đã lưu bản đối chiếu.", { exact: true }).waitFor();
    const dl = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "PDF đề và đáp án", exact: true })
      .click();
    const download = await dl;
    await download.saveAs(`test-results/school-upgrade-${name}.pdf`);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `${name}: digitize overflow`,
    );
    await page.screenshot({
      path: `test-results/school-digitize-${name}.png`,
      fullPage: true,
    });
    await page.goto(origin + "/school/notebook");
    await page
      .getByRole("heading", { name: "Vở học AI", exact: true })
      .waitFor();
    const notebook = page.locator("[data-doc-upload]");
    await notebook.locator("input[name=title]").fill(`Vở ${name}`);
    await notebook.locator("details").evaluate((x) => (x.open = true));
    await notebook
      .locator("textarea[name=manualText]")
      .fill("Bài làm: 1 + 1 = 3");
    await notebook.getByRole("button", { name: "Thêm tài liệu" }).click();
    await page.locator("[data-doc-review] textarea[name=transcript]").waitFor();
    await page.locator("[data-doc-review] input[name=confirmed]").check();
    await page.getByRole("button", { name: "Lưu bản đối chiếu" }).click();
    await page.getByText("Đã lưu bản đối chiếu.", { exact: true }).waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `${name}: notebook overflow`,
    );
    await page.goto(origin + "/school/rooms");
    await page
      .getByRole("heading", { name: "Phòng học School", exact: true })
      .waitFor();
    await page
      .getByText("Chưa kết nối dịch vụ video.", { exact: false })
      .waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Tạo phòng School" }).isDisabled(),
      true,
    );
    await page.screenshot({
      path: `test-results/school-rooms-${name}.png`,
      fullPage: true,
    });
    await page.goto(origin + "/school/lab");
    await page
      .getByRole("heading", { name: "Thí nghiệm School", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Thí nghiệm 3D", exact: true })
      .click();
    await page
      .locator("[data-lab-kind] option")
      .first()
      .waitFor({ state: "attached" });
    await page.locator("[data-lab-canvas] canvas").waitFor();
    await page.getByRole("button", { name: "Ghi số đo", exact: true }).click();
    await page.getByRole("button", { name: "Lưu phiên", exact: true }).click();
    await page
      .getByText("Đã lưu phiên thí nghiệm trên backend.", { exact: true })
      .waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `${name}: lab overflow`,
    );
    await page.screenshot({
      path: `test-results/school-lab-${name}.png`,
      fullPage: true,
    });
    await page.goto(origin + "/school/progress");
    await page
      .getByRole("heading", { name: "Bằng chứng và nhóm phụ đạo · thử nghiệm" })
      .waitFor();
    await page
      .locator("[data-evidence-filter] select[name=classId]")
      .selectOption({ label: "Lớp 12A1" });
    await page
      .getByRole("button", { name: "Phân tích 30 ngày gần nhất" })
      .click();
    await page
      .getByText("Chưa có bằng chứng câu đã chấm trong phạm vi này.")
      .waitFor();
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `School beta ${name}: document review/PDF, notebook persistence, service gating, WebGL/save, evidence and overflow passed.`,
    );
  }
} finally {
  await browser?.close();
  preview.kill("SIGTERM");
}
