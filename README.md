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

Yêu cầu Node.js 18+.

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

3. Trong `server/.env`, cấu hình `ADMIN_EMAIL` và `ADMIN_PASSWORD`. Mật khẩu Admin cần ít nhất 12 ký tự. Có thể điền `GEMINI_API_KEY` nếu muốn bật đánh giá độ khó bằng AI. Không commit hoặc chia sẻ file `.env`.

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
