<div align="center">

# 📘 MAI HỌC
### Website học tập & luyện thi

**Học tập chủ động · Luyện thi hiệu quả · Tiến bộ mỗi ngày**

Một nền tảng hỗ trợ học tập và ôn luyện, được xây dựng với mong muốn mang đến trải nghiệm học tập trực quan, thuận tiện và dễ tiếp cận.

</div>

---

## ✨ Giới thiệu dự án

**MAI HỌC** là website học tập và luyện thi, hướng đến việc hỗ trợ người học trong quá trình ôn tập và rèn luyện kiến thức. Dự án tập trung xây dựng trải nghiệm sử dụng rõ ràng, thân thiện và tạo nền tảng để phát triển thêm các tính năng học tập trong tương lai.

## 👥 Đội ngũ dự án

### 💻 Developers


**Nguyễn Việt Hải - UET-VNU**  
*Developer*

**Nguyễn Đức Hải - FPTU HN**  
*Developer Assistant*

**Nguyễn Xuân Hoàng - FPTU HN**  
*Developer*


### 📈 Sales Managers


**Phạm Quang Minh - AOF**  
*Sales Manager*

**Đỗ Gia Bách - UL-VNU**  
*Sales Manager*


## 🗂️ Cấu trúc Project (For Developers)

```text
MAIHOC-Learning-System/
├── index.html                        # Vỏ giao diện SPA, Topbar, Menu và các Modal
├── package.json                      # Cấu hình dự án Root & script chạy kiểm thử
├── worker.js                         # Cloudflare Worker reverse-proxy & static server
├── wrangler.jsonc                    # Cấu hình triển khai Cloudflare Workers/Pages
├── load-test.js                      # Kịch bản stress test tải hệ thống (Autocannon)
├── README.md                         # Tài liệu giới thiệu hệ thống
├── configs/                          # HỆ THỐNG CẤU HÌNH DỮ LIỆU & BỐ CỤC ĐỀ THI
│   ├── exam-layouts.json             # Thang điểm & bố cục đề thi cũ (tương thích ngược)
│   └── subjects/                     # Danh bạ & cấu hình độc lập 8 môn học
│       ├── registry.json             # Danh bạ trung tâm quản lý 8 môn học
│       ├── math.json                 # Cấu hình môn Toán
│       ├── chemistry.json            # Cấu hình môn Hóa học
│       ├── physics.json              # Cấu hình môn Vật lý
│       ├── english.json              # Cấu hình môn Tiếng Anh
│       ├── biology.json              # Cấu hình môn Sinh học
│       ├── literature.json           # Cấu hình môn Ngữ văn
│       ├── national-exam.json        # Cấu hình Đề thi THPT Quốc gia
│       └── ielts.json                # Cấu hình môn IELTS
├── css/                              # HỆ THỐNG GIAO DIỆN & STYLE
│   ├── styles.css                    # CSS toàn cục, giao diện chính, Dark mode, đề thi
│   ├── chemistry.css                 # CSS Bảng tuần hoàn, Máy tính mol, AI Hóa học
│   ├── tests.css                     # CSS hàng đợi Bài kiểm tra định kỳ & chấm thi
│   └── chat.css                      # CSS khung chat thời gian thực
├── js/                               # MÃ NGUỒN FRONTEND (VANILLA JAVASCRIPT ES MODULES)
│   ├── app.js                        # Điều hướng SPA (Router), State, vòng đời ứng dụng
│   ├── data.js                       # Tài liệu mẫu, danh mục, xuất SUBJECTS tương thích
│   ├── ui.js                         # Tiện ích DOM: $, toast, openDialog, closeDialog
│   ├── ai.js                         # Client gọi API AI (đánh giá độ khó, giải Hóa học)
│   ├── documents.js                  # Client quản lý & upload tài liệu (R2 / SQLite)
│   ├── question-parser.js            # Phân tích câu hỏi đề thi từ văn bản / DOCX
│   ├── pdf-reader.js                 # Trình đọc tài liệu PDF tích hợp (PDF.js)
│   ├── account-features.js           # Quản lý tài khoản cá nhân, xác minh Gmail, Admin
│   ├── chat.js                       # Client giao diện chat trực tuyến qua WebSocket
│   ├── theme.js                      # Xử lý đổi giao diện Sáng / Tối
│   ├── core/                         # TẦNG LÕI HỆ THỐNG FRONTEND
│   │   └── subject-registry.js       # Registry quản lý 8 môn học, tìm kiếm & fallback
│   ├── subjects/                     # MODULE MÔN HỌC CẮM GHÉP (PLUGGABLE SUBJECTS)
│   │   ├── base-subject.js           # Lớp cơ sở (Base Class) chuẩn hóa giao diện môn học
│   │   ├── math/
│   │   │   └── index.js              # Module chuyên biệt môn Toán
│   │   └── chemistry/
│   │       └── index.js              # Module chuyên biệt môn Hóa học (công cụ, định tuyến, sự kiện)
│   ├── chemistry/                    # CÔNG CỤ NỘI DUNG MÔN HÓA HỌC
│   │   ├── periodic-table-data.js    # Cơ sở dữ liệu 118 nguyên tố hóa học
│   │   ├── periodic-table.js         # Dựng & lọc Bảng tuần hoàn 18x7, Modal chi tiết
│   │   ├── mole-calculator.js        # Bóc tách công thức & máy tính 4 tab số mol
│   │   └── chemistry-tutor.js        # Giao diện AI gia sư Hóa học
│   └── tests/                        # MODULE BÀI KIỂM TRA ĐỊNH KỲ (FRONTEND)
│       └── index.js                  # Giao diện hàng đợi bài kiểm tra & modal chấm bài
├── server/                           # MÃ NGUỒN BACKEND (NODE.JS / EXPRESS / SQLITE)
│   ├── server.js                     # File khởi động Express, WebSockets, nạp routes
│   ├── auth.js                       # Xác thực, phân quyền, khởi tạo DB `maihoc.sqlite`
│   ├── chat.js                       # Xử lý logic Chat WebSocket & lưu tin nhắn
│   ├── r2-storage.js                 # Tích hợp lưu trữ Cloudflare R2 qua AWS SDK S3
│   ├── package.json                  # Dependencies backend (express, better-sqlite3,...)
│   ├── .env                          # Biến môi trường (GEMINI_API_KEY, R2, PORT)
│   ├── routes/                       # ĐỊNH TUYẾN EXPRESS TÁCH BIỆT (MODULAR ROUTES)
│   │   ├── ai.routes.js              # Route đánh giá độ khó & AI giải Hóa học
│   │   └── subjects.routes.js        # Route cung cấp danh bạ & cấu hình môn học
│   ├── grading/                      # ĐỘNG CƠ CHẤM ĐIỂM BÀI THI
│   │   ├── engine.js                 # Thuật toán chấm trắc nghiệm, đúng/sai, trả lời ngắn
│   │   └── exam-solution-engine.js   # Tạo lời giải đề thi tự động bằng Gemini AI
│   ├── tests-module/                 # QUẢN LÝ BÀI KIỂM TRA & KẾT QUẢ HỌC TẬP
│   │   ├── index.js                  # Xử lý tạo đề, nộp bài, tính giờ, chấm tự động
│   │   ├── results-db.js             # Quản lý DB `learning-results.sqlite`, bảng môn học
│   │   └── sheets-exporter.js        # Xuất kết quả học tập ra file Excel XLSX và CSV
│   └── study-rooms/                  # WEBSOCKET PHÒNG HỌC (BACKEND)
│       └── server.js                 # Quản lý danh sách phòng tự học và người tham gia
├── study-rooms/                      # PHÒNG TỰ HỌC ẢO (VIRTUAL STUDY ROOMS)
│   ├── client.js                     # Giao diện WebRTC (video call, mic, chia sẻ màn hình, Pomodoro)
│   ├── styles.css                    # CSS riêng cho phòng tự học và video call
│   └── README.md                     # Tài liệu kiến trúc phòng tự học
├── tests/                            # HỆ THỐNG KIỂM THỬ TỰ ĐỘNG (NODE TEST RUNNER)
│   ├── chemistry.test.js             # Kiểm thử Bảng tuần hoàn, Máy tính mol, mẫu Hóa học
│   ├── subject-registry.test.js      # Kiểm thử 8 môn học trong Registry & tương thích ngược
│   ├── server-routes.test.js         # Kiểm thử các API routes Backend
│   ├── grading-config.test.js        # Kiểm thử động cơ chấm điểm môn Toán
│   └── tests-module.test.js          # Kiểm thử xuất bảng điểm Excel XLSX / CSV
└── dist/                             # THƯ MỤC BUILD OUTPUT ĐỒNG BỘ CHO CLOUDFLARE WORKERS
```




<div align="center">

**MAI HỌC** · Cùng học tập, cùng tiến bộ.

</div>
