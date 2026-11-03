import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { db, pool } from "../postgres.js";
import { upgradeEnabled } from "./policy.js";
import { reconcileSchoolRoomAccess } from "../study-rooms/school.js";
import { maintainSchoolAssets } from "./maintenance.js";
import { workDocumentOnce } from "./documents.js";
dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });
if (!upgradeEnabled())
  throw new Error(
    "Bật MAIHOC_PLATFORM_ENABLED=1 và MAIHOC_SCHOOL_UPGRADE_ENABLED=1 trước khi chạy worker.",
  );
let stop = false,
  wake,
  lastMaintenance = 0;
process.on("SIGTERM", () => {
  stop = true;
  wake?.();
});
process.on("SIGINT", () => {
  stop = true;
  wake?.();
});
try {
  while (!stop) {
    if (Date.now() - lastMaintenance > 60000) {
      lastMaintenance = Date.now();
      try {
        await reconcileSchoolRoomAccess(db);
      } catch {
        console.error(
          "School room reconciliation: sẽ kiểm tra lại quyền media.",
        );
      }
      try {
        await maintainSchoolAssets(db);
      } catch {
        console.error(
          "School asset maintenance: chưa đồng bộ được tệp/ghi hình; sẽ thử lại.",
        );
      }
    }
    try {
      if (await workDocumentOnce({ db })) continue;
    } catch {
      console.error(
        "School document worker: kiểm tra migration/kết nối PostgreSQL.",
      );
    }
    await new Promise((r) => {
      const timer = setTimeout(r, 2000);
      wake = () => {
        clearTimeout(timer);
        r();
      };
    });
  }
} finally {
  await pool.end();
}
