# MAI HỌC — website học tập & luyện thi

Bản MVP đa trang theo luồng Paint đã gửi, ưu tiên môn Toán; các môn khác hiển thị thông báo Coming soon. Giao diện dùng Montserrat, light/dark mode, transition nhẹ, upload tài liệu, trang đọc tài liệu, chọn đề và phòng thi thử 90 phút.

## Cấu trúc

- `index.html`: khung trang, modal đăng nhập/đăng ký và modal tải tài liệu.
- `css/styles.css`: giao diện responsive, light/dark theme và animation.
- `js/app.js`: điều hướng trang, tài khoản trên giao diện, trang quản trị, luồng học tập và phòng thi.
- `js/data.js`: dữ liệu mẫu, danh mục.
- `js/theme.js`: chuyển light/dark.
- `js/documents.js`: đọc thư viện và upload tài liệu.
- `js/ai.js`: gọi API đánh giá độ khó.
- `js/ui.js`: tiện ích giao diện.
- `server/server.js`: API xác thực, phân quyền, upload và Gemini.
- `server/auth.js`: SQLite users/sessions, băm mật khẩu bằng scrypt và middleware kiểm tra quyền.
- `server/data/maihoc.sqlite`: database local, tự tạo khi chạy server; không commit.
- `uploads/`: tệp upload và metadata.

## Chạy local (khuyến nghị)

Yêu cầu Node.js 22.13+ để engine có thể trích xuất đáp án từ PDF.

1. Mở terminal tại thư mục `server` và cài thư viện:

   ```bash
   cd server
   npm install
   ```

2. Sao chép cấu hình mẫu và chỉnh sửa:

   ```bash
   cp .env.example .env
   ```

   Trên Windows PowerShell có thể dùng `Copy-Item .env.example .env`.

3. Trong `server/.env`, cấu hình `ADMIN_EMAIL` và `ADMIN_PASSWORD`. Mật khẩu Admin cần ít nhất 12 ký tự. Engine giải đề dùng Gemini: đặt `GEMINI_API_KEY=<API key của bạn>` và `GEMINI_SOLUTION_MODEL=gemini-3.8-flash`. Không commit hoặc chia sẻ file `.env`.

4. Khởi chạy máy chủ:

   ```bash
   npm start
   ```

5. Mở **http://localhost:3000**. Không mở `index.html` trực tiếp và không dùng `python -m http.server` để kiểm thử xác thực, vì frontend cần cùng origin với API.

Nếu database chưa có tài khoản Admin, máy chủ tạo tài khoản từ `ADMIN_EMAIL`, `ADMIN_PASSWORD` và `ADMIN_NAME` khi khởi động. Sau lần tạo đầu tiên, thay đổi biến môi trường không tự đổi mật khẩu của tài khoản đã tồn tại.

## Tài khoản và phân quyền đã triển khai

- Đăng ký bằng tên, email và mật khẩu; mật khẩu tối thiểu 10 ký tự.
- Đăng nhập, xem trạng thái tài khoản và đăng xuất.
- Mật khẩu được băm bằng scrypt; phiên đăng nhập dùng token ngẫu nhiên, lưu dạng hash trong SQLite và cookie `HttpOnly; SameSite=Lax`.
- Vai trò được xác định ở máy chủ. Đăng ký công khai chỉ tạo vai trò `user`; không có checkbox/nút trên giao diện nào có thể tự nâng quyền Admin.
- Admin được vào trang Quản trị để xem danh sách tài khoản và được phép upload tài liệu.
- Endpoint upload kiểm tra quyền Admin ở backend; gọi API trực tiếp với vai trò User sẽ bị từ chối.
- Có giới hạn thử đăng nhập theo email/IP trong bộ nhớ và kiểm tra Origin cho các thao tác ghi từ trình duyệt.
- Tệp cơ sở dữ liệu và mã nguồn backend không được phục vụ như tài nguyên tĩnh.

Các trang học tập và luyện thi hiện vẫn có thể xem khi chưa đăng nhập. Database tài khoản đã có; việc lưu lịch sử làm bài/điểm theo tài khoản sẽ là bước tích hợp tiếp theo, chưa được tuyên bố là hoàn thành trong phiên bản này.

## Chạy giao diện demo không có backend

Vì JavaScript sử dụng ES modules, có thể dùng một web server tĩnh để xem giao diện:

```bash
python -m http.server 8080
```

Mở `http://localhost:8080`. Trong chế độ này, tài khoản không hoạt động vì backend không chạy; chỉ dùng để xem giao diện. Upload có thể rơi về chế độ demo lưu cục bộ, không phù hợp để bảo vệ tài liệu hoặc dữ liệu tài khoản.

## Bật upload máy chủ và Gemini

Máy chủ Express đã tích hợp upload giới hạn 20 MB/tệp. Chỉ Admin đăng nhập mới tải được tệp lên qua API. Đánh giá độ khó cần `GEMINI_API_KEY` trong `server/.env`.

## Những việc cần làm trước khi đưa lên Internet

- Dùng HTTPS và đặt `NODE_ENV=production` để cookie phiên có cờ `Secure`.
- Đặt `PUBLIC_ORIGIN` chính xác theo origin công khai; kiểm tra reverse proxy/domain khi triển khai.
- Chuyển database/tệp upload sang ổ lưu trữ có backup phù hợp môi trường deploy.
- Bổ sung xác minh email, quên/đặt lại mật khẩu, quản lý thu hồi phiên và công cụ khóa tài khoản.
- Cân nhắc rate limit dùng store bền vững, logging/audit, quét tệp upload và chính sách bảo vệ dữ liệu.
- Tích hợp lịch sử thi và tiến độ học tập với ID tài khoản; bổ sung đáp án chuẩn và chấm điểm chính xác.
- Kiểm tra quyền riêng tư, bản quyền tài liệu và điều khoản sử dụng Gemini trước khi public.

## Tài khoản, tiến trình và duyệt tài liệu

- `server/data/maihoc.sqlite` lưu tài khoản, phiên đăng nhập, tiến trình học, thông báo và hồ sơ tài liệu chờ duyệt.
- `uploads/` lưu tài liệu đã được Admin duyệt; `uploads/pending/` chứa file chờ duyệt và không được phục vụ công khai.
- User cần đăng nhập để gửi tài liệu. Tài liệu chỉ xuất hiện trong thư viện sau khi Admin duyệt tại trang Quản trị.
- Biến `ADMIN_EMAIL` nhận email báo có tài liệu chờ duyệt. Cấu hình `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` và `SMTP_FROM` trong `server/.env` để bật email. Với Gmail, dùng App Password, không dùng mật khẩu tài khoản thường.
- API tiến trình: `GET /api/progress`, `PUT /api/progress`; Admin có thể xem dữ liệu tổng hợp qua `GET /api/admin/progress`. Thông báo: `GET /api/notifications`.
- Sau khi cập nhật dependency, chạy `cd server` rồi `npm install` để cài thêm `nodemailer` và cập nhật `package-lock.json`.

## Cấu hình bố cục đề

- `configs/exam-layouts.json` lưu bố cục theo tên môn. `assessment.sections` dùng chung cho đề ôn tập và thi thử; có thể khai báo riêng `practice` hoặc `exam` để ghi đè.
- Mỗi section có `order`, `type` (`multiple_choice`, `true_false`, `essay`), `title` và `count`. Trắc nghiệm có thể khai báo nhãn `options`; đúng/sai có thể khai báo các mệnh đề `statements`.
- Tiêu chí chấm đặt trong `grading.scale` và `grading` của từng section. Toán đang chấm trên thang 10: 0,25 mỗi câu trắc nghiệm, đúng/sai theo số mệnh đề đúng (0,1 / 0,25 / 0,5 / 1 điểm), và 0,5 mỗi câu trả lời ngắn.
- Đáp án chuẩn hóa nên dùng ID có mã phần, ví dụ `I-1`, `II-1a`, `III-1`; mệnh đề đúng/sai có thể nhập riêng theo ID hoặc gộp thành object `{"II-1":{"a":"Đúng","b":"Sai"}}`.
- Nếu PDF đáp án có nhiều mã đề, chọn mã mặc định tại `subjects.<môn>.grading.defaultAnswerVariant`; Toán hiện chọn mã `1001`.
- Chỉ màn hình đề ôn tập và thi thử áp dụng cấu hình. Màn hình đọc lý thuyết tiếp tục hiển thị tài liệu mà không áp dụng bố cục câu hỏi.
- Để thêm môn, thêm một khóa dưới `subjects` theo đúng tên môn trong thư viện rồi khai báo các section tương ứng. Nếu cần bố cục khác nhau, dùng khóa `practice` và/hoặc `exam` thay cho `assessment`.
