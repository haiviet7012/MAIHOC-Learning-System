import { dismissDevelopmentNotice } from './browser-notices.mjs';
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const password = randomUUID(),
  origin = "http://127.0.0.1:4190";
const preview = spawn(process.execPath, ["scripts/dev-preview.mjs"], {
  env: {
    ...process.env,
    PREVIEW_PORT: "4190",
    MAIHOC_PREVIEW_PASSWORD: password,
    MAIHOC_SCHOOL_UPGRADE_ENABLED: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let browser;
try {
  await new Promise((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error("Preview timeout")), 60000);
    preview.stdout.on("data", (c) => {
      out += c;
      if (out.includes("isolated preview ready")) {
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
  for (const [device, width, height] of [
    ["desktop", 1440, 1100],
    ["tablet", 1024, 1000],
    ["mobile", 390, 844],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr/, (r) =>
      r.abort(),
    );
    await context.request.post(origin + "/api/auth/login", {
      headers: { Origin: origin },
      data: { email: "student@maihoc.test", password },
    });
    for (const theme of ["light", "dark"]) {
      await page.goto(origin + "/school"); await dismissDevelopmentNotice(page);
      await page.locator(".school-overview-hero").waitFor();
      const dark = await page
        .locator("html")
        .evaluate((el) => el.classList.contains("dark"));
      if (dark !== (theme === "dark"))
        await page.locator("#theme-toggle").click();
      assert.equal(
        await page.locator("body").getAttribute("data-school-ui"),
        "",
      );
      await page.screenshot({
        path: `test-results/school-theme-overview-${theme}-${device}.png`,
        fullPage: true,
        animations: "disabled",
      });
      const mainStyles = await page
        .locator(".portal-panel")
        .first()
        .evaluate((el) => ({
          radius: parseFloat(getComputedStyle(el).borderRadius),
          surface: getComputedStyle(el).backgroundColor,
          color: getComputedStyle(el).color,
        }));
      assert.ok(mainStyles.radius >= 20);
      assert.notEqual(mainStyles.surface, mainStyles.color);
      const contrast = await page.evaluate(() => {
        const rgb = (value) =>
          (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        const luminance = (value) =>
          rgb(value)
            .map((x) => {
              x /= 255;
              return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
            })
            .reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0);
        return [
          ...document.querySelectorAll(
            ".school-overview-stats .portal-stat>span:not(.school-stat-symbol),.education-sidebar nav button.active",
          ),
        ].map((el) => {
          const fg = luminance(getComputedStyle(el).color);
          let p = el,
            bg = "";
          while (p) {
            bg = getComputedStyle(p).backgroundColor;
            if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") break;
            p = p.parentElement;
          }
          const b = luminance(bg);
          return {
            text: el.textContent,
            ratio: (Math.max(fg, b) + 0.05) / (Math.min(fg, b) + 0.05),
          };
        });
      });
      assert.ok(
        contrast.every((x) => x.ratio >= 4.5),
        JSON.stringify(contrast),
      );

      for (const [path, selector] of [
        ["/school/timetable", ".timetable-scroll"],
        ["/school/tutor", ".solver-panel"],
        ["/school/advisor", ".advisor"],
        ["/school/classes", ".school-page"],
        ["/school/tests", ".test-queue-window"],
        ["/school/digitize", "[data-doc-upload]"],
        ["/school/notebook", "[data-doc-upload]"],
        ["/school/rooms", "[data-room-create]"],
        ["/school/progress", "[data-evidence-filter]"],
      ]) {
        await page.goto(origin + path); await dismissDevelopmentNotice(page);
        await page.locator(selector).first().waitFor();
        assert.equal(
          await page.locator("body").getAttribute("data-school-ui"),
          "",
        );
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `${device}/${theme}: ${path} horizontal overflow`,
        );
        await page.waitForFunction(() =>
          [
            ...document.querySelectorAll(
              "#view input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]),#view textarea,#view select",
            ),
          ]
            .filter((el) => el.getClientRects().length)
            .every((el) => parseFloat(getComputedStyle(el).borderRadius) >= 8),
        );
        if (
          ["/school/timetable", "/school/tutor", "/school/advisor"].includes(
            path,
          )
        )
          await page.screenshot({
            path: `test-results/school-theme-${path.split("/").pop()}-${theme}-${device}.png`,
            fullPage: true,
            animations: "disabled",
          });
      }
      await page.goto(origin + "/school/timetable"); await dismissDevelopmentNotice(page);
      await page.locator('[data-place="0-0"]').waitFor();
      await page.locator('[data-subject-choice="Toán"]').click();
      await page.locator('[data-place="0-0"]').click();
      await page.locator("[data-save-timetable]").click();
      await page
        .getByText("Đã lưu thời khóa biểu vào tài khoản.", { exact: false })
        .waitFor();
      await page.reload(); await dismissDevelopmentNotice(page);
      await page
        .locator('[data-place="0-0"]')
        .filter({ hasText: "Toán" })
        .waitFor();
      await page.goto(origin + "/school/lab"); await dismissDevelopmentNotice(page);
      await page
        .getByRole("heading", { name: "Thí nghiệm School", exact: true })
        .waitFor();
      const lab = page.frameLocator("iframe.upgrade-lab-frame");
      await lab.locator("body[data-school-ui]").waitFor();
      assert.equal(
        await lab
          .locator("html")
          .evaluate((el) => el.classList.contains("dark")),
        theme === "dark",
      );
      await page.locator("#theme-toggle").click();
      await page.waitForFunction(
        () =>
          document
            .querySelector("iframe.upgrade-lab-frame")
            ?.contentDocument?.documentElement.classList.contains("dark") ===
          document.documentElement.classList.contains("dark"),
      );
      await page.locator("#theme-toggle").click();
    }
    // The logo stays anchored in the sidebar; the opposite-workspace action
    // must remain inside the top-right dropdown in both workspace layouts.
    await page.goto(origin + "/school"); await dismissDevelopmentNotice(page);
    await page.locator(".school-overview-hero").waitFor();
    await page.locator("#menu-toggle").click();
    const schoolHeaderGeometry = await page.evaluate(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      };
      return {
        logo: rect(".education-logo"),
        switch: rect("#workspace-switch"),
        menu: rect("#subject-menu"),
      };
    });
    await page.goto(origin + "/learning"); await dismissDevelopmentNotice(page);
    await page.locator("[data-personal-timetable]").waitFor();
    await page.locator("#menu-toggle").click();
    const learningHeaderGeometry = await page.evaluate(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      };
      return {
        logo: rect(".education-logo"),
        switch: rect("#workspace-switch"),
        menu: rect("#subject-menu"),
      };
    });
    for (const dimension of ["x", "y", "width", "height"]) {
      assert.ok(
        Math.abs(schoolHeaderGeometry.logo[dimension] - learningHeaderGeometry.logo[dimension]) < 0.5,
        `${device}: sidebar logo ${dimension} differs between Learning and School`,
      );
    }
    for (const geometry of [schoolHeaderGeometry, learningHeaderGeometry]) {
      assert.ok(geometry.menu.width > 0 && geometry.menu.x >= 0, `${device}: top menu is visible`);
      assert.ok(
        geometry.switch.x >= geometry.menu.x &&
          geometry.switch.y >= geometry.menu.y &&
          geometry.switch.x + geometry.switch.width <= geometry.menu.x + geometry.menu.width &&
          geometry.switch.y + geometry.switch.height <= geometry.menu.y + geometry.menu.height,
        `${device}: workspace switch remains inside the top-right dropdown`,
      );
    }
    assert.equal(
      await page.locator("body").getAttribute("data-school-ui"),
      null,
    );
    await page.waitForFunction(() => {
      const panel = document.querySelector(".portal-panel");
      return panel && getComputedStyle(panel).borderRadius === "0px";
    });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `${device}: School light/dark, 10 routes, timetable save/reload, tutor context, iframe theme sync and Learning isolation passed.`,
    );
  }
  const teacher = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  });
  const page = await teacher.newPage();
  await page.route(/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr/, (r) =>
    r.abort(),
  );
  await teacher.request.post(origin + "/api/auth/login", {
    headers: { Origin: origin },
    data: { email: "teacher@maihoc.test", password },
  });
  for (const path of [
    "/school/question-bank",
    "/school/assignment-management",
    "/school/advisor",
  ]) {
    await page.goto(origin + path); await dismissDevelopmentNotice(page);
    await page.locator("body[data-school-ui]").waitFor();
    await page.locator(".portal-panel").first().waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
  }
  await teacher.close();
} finally {
  await browser?.close();
  preview.kill("SIGTERM");
}
