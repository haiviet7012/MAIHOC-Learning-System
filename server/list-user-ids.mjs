import Database from "better-sqlite3";
import path from "node:path";

const db = new Database(
  path.resolve("data", "maihoc.sqlite"),
  { readonly: true, fileMustExist: true }
);

try {
  const keep = db
    .prepare("SELECT id, name, email, role FROM users WHERE id = ?")
    .get(1);

  if (!keep) {
    throw new Error("Không tìm thấy tài khoản ID 1. Dừng thao tác.");
  }

  if (keep.role !== "admin") {
    throw new Error("Tài khoản ID 1 không phải admin. Dừng thao tác.");
  }

  const admins = db
    .prepare("SELECT id, name, email, role FROM users WHERE role = ? ORDER BY id")
    .all("admin");

  console.error("TÀI KHOẢN SẼ GIỮ LẠI:");
  console.error(JSON.stringify(keep, null, 2));

  console.error("DANH SÁCH ADMIN HIỆN TẠI:");
  console.error(JSON.stringify(admins, null, 2));

  if (admins.some(user => user.id !== 1)) {
    console.error(
      "CẢNH BÁO: Có admin khác ID 1. Công cụ dọn dữ liệu hiện tại sẽ từ chối xóa các admin này."
    );
  }

  const rows = db
    .prepare("SELECT id FROM users WHERE id <> ? ORDER BY id")
    .all(1);

  console.log(rows.map(row => row.id).join(","));
} finally {
  db.close();
}
