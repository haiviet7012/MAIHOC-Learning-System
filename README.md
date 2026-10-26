# MAI HỌC — website học tập & luyện thi

Bản MVP đa trang theo luồng Paint đã gửi, ưu tiên môn Toán; các môn khác hiển thị thông báo Coming soon. Giao diện dùng Montserrat, light/dark mode, transition nhẹ, upload tài liệu, trang đọc tài liệu, chọn đề và phòng thi thử 90 phút.

## Cấu trúc

- `index.html`: khung trang và các modal dùng chung.
- `css/styles.css`: giao diện responsive, light/dark theme và animation.
- `js/app.js`: điều hướng trang, luồng học tập, phòng thi và đồng hồ.
- `js/data.js`: dữ liệu mẫu, danh mục.
- `js/theme.js`: chuyển light/dark.
- `js/documents.js`: đọc thư viện và upload tài liệu.
- `js/ai.js`: gọi API đánh giá độ khó.
- `js/ui.js`: tiện ích giao diện.
- `server/server.js`: API upload và Gemini; API key chỉ nằm ở backend.
- `uploads/`: được tạo khi server chạy và lưu tệp upload cùng metadata.

## Chạy giao diện demo

Vì JavaScript sử dụng ES modules, hãy chạy qua một web server thay vì mở `index.html` trực tiếp. Ví dụ, từ thư mục gốc:

```bash
python -m http.server 8080
```

Mở `http://localhost:8080`. Các tính năng giao diện và tài liệu mẫu hoạt động; upload khi backend chưa chạy chỉ lưu metadata/nội dung `.txt` trong localStorage của trình duyệt. Đánh giá Gemini cần backend.

## Bật upload máy chủ và Gemini

Yêu cầu Node.js 18+.

```bash
cd server
npm install
cp .env.example .env
```

Mở `server/.env`, điền `GEMINI_API_KEY`, sau đó:

```bash
npm start
```

Mở `http://localhost:3000`. Không chia sẻ API key hoặc commit file `.env`. Tệp upload được lưu trong `uploads/` (giới hạn 20 MB/tệp). Bản mẫu chưa có đăng nhập/ phân quyền thực sự; checkbox “Tôi là quản trị viên” chỉ là trường thông tin giao diện, không phải cơ chế bảo mật.

## Những gì đã có

- Trang chủ, menu môn học, trang tổng hợp môn Toán.
- Chọn lớp 10/11/12 cho lý thuyết, ôn tập và thi thử.
- Thư viện tài liệu mẫu; mở tài liệu trực tiếp trong trang.
- Upload tài liệu có lựa chọn môn, lớp, danh mục và tên tài liệu.
- Phòng thi với hai khung kéo thay đổi kích thước, câu trả lời lưu trong trạng thái phiên.
- Đồng hồ 90 phút, nhắc khi còn 5 phút và đổi sang cam, tự nộp khi hết giờ.
- Popup xác nhận nộp bài và trang kết quả cơ bản.
- Đánh giá độ khó qua Gemini backend.

## Cần hoàn thiện trước khi triển khai thật

- Thêm xác thực/ủy quyền admin cho upload, chống lạm dụng API, giới hạn tốc độ, quét tệp và backup.
- Xây cơ sở dữ liệu thay cho index JSON/localStorage.
- Thêm PDF viewer ổn định và trích xuất nội dung PDF/DOCX để Gemini phân tích đề đã upload.
- Cấu hình đáp án chuẩn, rubric và pipeline chấm tự động; hiện trang kết quả chỉ đếm số câu đã điền, không tự nhận đó là điểm.
- Tạo bài tập/nội dung thực tế cho các lớp và thiết kế quản trị kho tài liệu.
- Kiểm tra chính sách quyền riêng tư, bản quyền tài liệu và điều khoản sử dụng Gemini trước khi public.
