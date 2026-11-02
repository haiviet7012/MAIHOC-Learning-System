# Kiểm tra gửi email

Đăng ký giáo viên chỉ yêu cầu email trường có đuôi `.edu.vn` và hồ sơ hợp lệ, không gửi hoặc nhập OTP. Kiểm tra hậu tố không xác nhận quyền sở hữu hộp thư hay tư cách giáo viên. Tài khoản và dữ liệu cũ được giữ nguyên.

Engine email chung vẫn phục vụ quên mật khẩu, đổi email và thông báo School. SMTP và Resend đều được hỗ trợ. Không bỏ xác minh ở các thao tác khôi phục hoặc thay đổi tài khoản.

Chạy trong môi trường của service đang deploy (cùng biến môi trường với `node server.js`):

```sh
# Nếu Shell đang ở thư mục server:
node check-mail.js
node check-mail.js --verify
# Nếu Shell đang ở gốc repo:
npm run mail:check
npm run mail:check -- --verify
```

Các lệnh không gửi thư, không in mật khẩu, API key hay OTP. `CONFIG_PRESENT` chỉ xác nhận cấu hình có mặt. `SMTP_VERIFIED` xác nhận kết nối và đăng nhập, chưa bảo đảm thư đến inbox. Với Resend, phép kiểm tra domains cần quyền đọc; key chỉ có quyền gửi có thể bị từ chối phép kiểm tra này dù vẫn gửi được thư.

- `MAIL_NOT_CONFIGURED`: kiểm tra biến môi trường. SMTP dùng `SMTP_HOST`, `SMTP_PORT` (587 hoặc 465), `SMTP_USER`, `SMTP_PASS`, tùy chọn `MAIL_FROM`/`SMTP_FROM`. Gmail hỗ trợ `GMAIL_USER`, `GMAIL_APP_PASSWORD`; dùng mật khẩu ứng dụng. Resend dùng `MAIL_PROVIDER=resend`, `RESEND_API_KEY`, `MAIL_FROM`/`RESEND_FROM` của tên miền đã xác minh.
- `EAUTH`: kiểm tra thông tin đăng nhập và quyền SMTP.
- `ETIMEDOUT`/`ECONNECTION`/`ESOCKET`: kiểm tra kết nối từ môi trường deploy đến nhà cung cấp email.
- `MAIL_HTTP_401`/`MAIL_HTTP_403`: kiểm tra API key, quyền và tên miền gửi tại nhà cung cấp.
- `MAIL_RECIPIENT_REJECTED`: máy chủ từ chối người nhận.

Log server `Verification email failed` chỉ ghi provider và mã lỗi, không ghi mã xác minh hay thông tin đăng nhập. Thông báo cũ “Chưa gửi được email xác minh…” không đủ để xác định nguyên nhân cụ thể.

Kiểm tra giao nhận cuối cùng bằng tính năng Quên mật khẩu với tài khoản của bạn: nhận thư, nhập mã, đặt lại mật khẩu và đăng nhập. Kiểm tra cả Spam. Không gửi OTP vào log hoặc chia sẻ OTP khi báo lỗi.
