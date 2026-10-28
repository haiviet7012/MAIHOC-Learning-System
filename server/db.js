const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Đường dẫn lưu file database.sqlite ngay trong thư mục server/
const dbPath = path.resolve(__dirname, 'database.sqlite');

// Khởi tạo kết nối
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Lỗi kết nối SQLite:', err.message);
    } else {
        console.log('Đã kết nối thành công tới cơ sở dữ liệu SQLite.');
    }
});

// Khởi tạo các bảng dữ liệu (ví dụ: bảng users và documents)
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS exams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            score REAL,
            user_id INTEGER,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);
});

module.exports = db;