# Email bài kiểm tra và thông báo giáo viên

Khi giáo viên tạo thành công một bài kiểm tra có chọn lớp hoặc Cả khối, MAIHOC tạo thông báo trên web và hàng đợi email cho đúng học sinh thuộc nhóm đó. Cả khối được lọc theo khối của bài, không gửi toàn trường. Không gửi lại email khi sửa/đọc thông báo hay khởi động lại server.

Trong **School → Lớp của bạn**, giáo viên có biểu mẫu **Gửi thông báo cho học sinh**: chọn một lớp được phân công hoặc cả khối 10/11/12, nhập tiêu đề/nội dung và gửi. Biểu mẫu gửi riêng tới Admin hiện có vẫn được giữ. Chính sách Cả khối cho giáo viên giống chính sách giao bài hiện hữu.

## Người nhận

- Lớp: thành viên trong `school_class_members` của đúng lớp; Cả khối: hợp các lớp thuộc khối đã chọn.
- Chỉ tài khoản học sinh trong trường (`role=user`, `admin_level=0`, `account_type=school`); loại khách, học viên ngoài trường, giáo viên, Admin và học sinh chưa vào lớp.
- Một học sinh có nhiều bản ghi lớp chỉ nhận một email cho mỗi sự kiện.
- Bài từ ngân hàng câu hỏi của School mới dùng học sinh đang được xếp lớp và có membership học sinh active trong đúng trường, không dùng mã lớp toàn cục.
- Danh sách người nhận được chốt tại lúc giao bài/gửi thông báo. Thêm học sinh vào lớp sau đó không gửi lại nội dung cũ. Địa chỉ nhận là email hiện tại của chính tài khoản; mỗi email gửi riêng, không lộ danh sách người khác.

## Liên kết

Email chứa liên kết HTTPS của frontend:

- `/school/tests/<id>`: mở bài kiểm tra theo luồng hiện tại. Kiểm tra chưa mở/đã đóng vẫn tuân thủ thời gian và quyền của backend.
- `/school/announcements/<id>`: trang nội dung đầy đủ, chỉ tác giả và các tài khoản trong danh sách nhận được đọc.
- `/school/assignments/<id>?schoolId=<id>`: mở đúng bài được giao trong đúng trường; người học bấm Mở bài để bắt đầu.

Khi chưa đăng nhập, đường dẫn được giữ nguyên, hiển thị yêu cầu đăng nhập. Dùng đúng tài khoản nhận email; liên kết không thay thế quyền truy cập. Học sinh cũng xem lại thông báo qua nút Thông báo từ giáo viên trong Lớp của bạn và liên kết Xem nội dung trong hộp thông báo.

## Triển khai trên Render

1. Deploy frontend + backend của cùng commit. Start command hiện có `node server.js` giữ nguyên.
2. Dùng cấu hình email hiện có trong `server/mail-delivery.js`: SMTP hoặc Resend. Không tạo dịch vụ gửi Gmail riêng và không đưa thông tin bí mật vào frontend.
3. Đặt `APP_PUBLIC_URL` là URL frontend mà học sinh truy cập, ví dụ `https://<ten-mien-cua-ban>`. Nếu bỏ trống, dùng `PUBLIC_ORIGIN`, rồi `RENDER_EXTERNAL_URL`. Với frontend riêng backend, phải đặt URL frontend. Chỉ chấp nhận HTTPS trong production; HTTP chỉ dành cho localhost.
4. Tự tạo ba bảng bổ sung khi backend khởi động: `school_announcements`, `school_announcement_recipients`, `school_mail_outbox`. DB user cần quyền CREATE TABLE/INDEX, không có drop/migration dữ liệu cũ.
5. Worker chạy cùng tiến trình web, mỗi 15 giây xử lý tối đa 20 email; không cần bật AI worker hoặc đổi start command. Ở `NODE_ENV=test`, worker không tự chạy. Render service ngủ thì email chờ tới khi tiến trình hoạt động lại; service luôn chạy cho thời gian gửi ổn định.
6. Thiếu mail config hoặc URL hợp lệ: giữ trạng thái queued, không đánh dấu đã gửi. Số người nhận hiển thị sau khi gửi thông báo là số được xếp hàng, không phải xác nhận Gmail đã nhận.

Worker dùng lease 2 phút, claim nguyên tử và SKIP LOCKED để nhiều instance không xử lý cùng một job đồng thời. Lỗi dịch vụ được thử lại tối đa 8 lần với khoảng chờ tăng dần. Mỗi `(event_key,user_id)` là duy nhất. Gửi là at-least-once: nếu tiến trình dừng sau khi provider đã nhận nhưng trước khi ghi trạng thái sent, lần khôi phục có thể gửi trùng một email. `sent` chỉ nghĩa provider đã chấp nhận, không bảo đảm vào Inbox thay vì Spam.

Có thể kiểm tra từ SQL console quản trị (không cần truy vấn email cá nhân):

```sql
SELECT status, count(*) FROM school_mail_outbox GROUP BY status;
SELECT id,event_key,attempts,last_error FROM school_mail_outbox WHERE status='failed';
```

Sau khi sửa cấu hình mail, queued tiếp tục tự xử lý. Để thử lại các job đã hết lượt sau khi khắc phục lỗi:

```sql
UPDATE school_mail_outbox SET status='queued', attempts=0, next_at=0, claim_token=NULL
WHERE status='failed';
```

## Kiểm chứng

Test API dùng PostgreSQL/PGlite cô lập, mock gửi email; không gửi thư thật. Bao phủ lớp/khối, loại tài khoản ngoài phạm vi, quyền đọc thông báo, CSRF, chống enqueue trùng, một địa chỉ mỗi thư, escape HTML, retry/restart và hủy thư của sự kiện bị xóa. Test trình duyệt kiểm tra biểu mẫu giáo viên và đăng nhập từ liên kết email. Cấu hình SMTP/Resend và khả năng vào Inbox của môi trường production phải được kiểm tra sau deploy bằng tài khoản thử nghiệm.
