# Đăng ký giáo viên, email xác minh và poster

Đăng ký công khai có thêm lựa chọn Giáo viên. Tài khoản dùng mô hình giáo viên hiện tại (`role=admin`, `admin_level=1`, `account_type=school`), không cấp quyền Super Admin và không tự gán lớp/môn. Các tham số `role`/`adminLevel` do client gửi không được dùng để cấp quyền. Quản trị viên phân công môn/lớp qua chức năng đang có. Không đổi schema database.

Luồng khôi phục truyền đúng purpose vào bộ gửi thư. Khi gửi thất bại, backend trả HTTP 503 và xóa mã của lần gửi đó, cho phép thử lại; frontend ở lại bước nhập email thay vì báo thành công. Khi gửi thành công, giữ cooldown 30 giây, hạn mã 10 phút và giới hạn nhập sai hiện có. OTP khôi phục không được trả qua API, log hoặc thông báo trong web.

## Cấu hình backend

SMTP hiện tại tiếp tục hoạt động qua `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`; vẫn nhận các alias GMAIL/EMAIL đang có. Gmail cần App Password, không phải mật khẩu đăng nhập thường. Không tắt kiểm tra chứng chỉ TLS.

Nếu môi trường chặn SMTP, cấu hình email qua HTTPS:

```dotenv
MAIL_PROVIDER=resend
RESEND_API_KEY=<private-api-key>
MAIL_FROM=MAIHOC <no-reply@your-verified-domain.com>
```

Đặt các giá trị thật trong Environment của backend Render rồi redeploy. `MAIL_FROM` phải là sender/domain đã xác minh với Resend, không dùng địa chỉ Gmail tùy ý. Nếu không đặt `MAIL_PROVIDER`, có `RESEND_API_KEY` sẽ chọn Resend; không có thì dùng SMTP. Không lưu API key trong frontend hoặc git. Không cần package mới.

Nếu thư không gửi được, kiểm tra log `Verification email failed` (chỉ provider và mã lỗi, không có OTP/secret). `EAUTH`: thông tin SMTP không được chấp nhận; `ETIMEDOUT`/`ECONNECTION`/`ESOCKET`: kết nối SMTP; `MAIL_HTTP_401`/`403`: API key hoặc quyền sender/domain; `MAIL_HTTP_429`: giới hạn dịch vụ. Không có cấu hình sẽ báo dịch vụ email chưa sẵn sàng. Không thể kiểm chứng thư thực nhận nếu chưa có cấu hình hợp lệ ở môi trường triển khai.

Nguồn: [Render Free limits](https://render.com/docs/free), [Resend Send Email API](https://resend.com/docs/api-reference/emails/send-email).

## Ảnh và giao diện

Các dialog Đăng nhập, Đăng ký và Quên mật khẩu dùng đường dẫn `/images/poster.jpg`, được phục vụ từ `public/images/poster.jpg`. Thêm đúng tên file (phân biệt hoa thường trên Linux), commit và build/redeploy. Không ghi đè ảnh người dùng bằng ảnh mẫu. Nếu chưa có file, nền trắng vẫn hiện và biểu mẫu hoạt động.

Nút đóng riêng cửa sổ Thông báo dùng hình chữ nhật 52 × 40 px, bo góc 9 px, căn theo hai cạnh trên/phải trong header, không bị kéo thành hình oval.

## Kiểm tra

`node --test server/tests/mail-delivery.test.js server/tests/auth-flows.test.js server/tests/platform-foundation.test.js` dùng database tách biệt và mail transport giả, không gửi thư ra ngoài. Bao phủ đăng ký giáo viên/học sinh, không cấp Super Admin, gửi lỗi và thử lại, không lộ OTP, cooldown, sai mã, reset một lần, đăng nhập bằng mật khẩu mới. Provider HTTPS/SMTP được kiểm tra bằng mock.
