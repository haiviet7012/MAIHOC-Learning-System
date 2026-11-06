# Công cụ quản lý nhà trường

Trong School → Quản lý nhà trường, chọn trường và lớp để mở sổ liên lạc, bảng tin, lịch, sổ điểm và chuyên cần.

## Triển khai

- Chạy migration theo quy trình hiện có: `npm run db:migrate` (production vẫn yêu cầu sao lưu và cờ MAIHOC_BACKUP_VERIFIED theo migrate.js). Migration 011 tạo school_guardians và school_management_records.
- Giữ MAIHOC_PLATFORM_ENABLED=1 và cấu hình email/public app URL theo hệ thống school-notifications hiện có. Hàng đợi phụ huynh dùng cùng mail worker, không cần worker mới.
- Build frontend với `npm run build`, deploy frontend và backend.

## Phạm vi và cách dùng

- Quản trị trường được liên kết tài khoản phụ huynh đã đăng ký với học sinh. Bật/tắt auto-notify bằng cách lưu lại liên kết; mặc định tắt. Cần xác minh đúng phụ huynh ngoài hệ thống trước khi liên kết.
- Tin trực tiếp có ba nhóm: học tập, hành vi, khoản thu. Gửi tới các phụ huynh được liên kết, nội dung có tên học sinh. Chưa có chat hai chiều. Việc gửi email phụ thuộc cấu hình mail và worker; tạo hàng đợi không đồng nghĩa email đã giao thành công.
- Điểm và chuyên cần gửi email khi phụ huynh đã bật thông báo tự động. Mỗi lần sửa cũng tạo thông báo mới. Không thay đổi dữ liệu thu phí thực tế.
- Bảng tin nhận nội dung và URL HTTPS tới ảnh/video đã tải lên kho trường; chưa cung cấp tải tệp trực tiếp. Video mở qua liên kết, không nhúng iframe tùy ý. Không dùng URL công khai cho media riêng tư.
- Lịch có thời điểm bắt đầu/kết thúc; giáo viên đăng trong lớp phụ trách, quản trị trường có thể đăng toàn trường. Chức năng thời khóa biểu cũ vẫn dùng được ở điều hướng hiện có. Đây là lịch theo ngày giờ, chưa có lặp tuần hay đồng bộ lịch bên ngoài.
- Sổ điểm: điểm 0–10 và hệ số >0 đến 10. Cột cùng tên, học sinh, môn, học kỳ và lớp được cập nhật thay vì nhân đôi. Trung bình dùng toàn bộ điểm trong lớp, không chỉ 1000 bản ghi gần nhất đang hiển thị. Phân loại tham khảo theo trung bình môn: Tốt ≥8, Khá ≥6.5, Đạt ≥5. Không phải xếp loại học lực chính thức theo quy định.
- Chuyên cần: có mặt/đi muộn/nghỉ có phép/nghỉ không phép. Cùng học sinh, ngày, lớp, buổi được cập nhật. Nhập theo từng học sinh.
- Giáo viên chỉ quản lý lớp được phân công, nhập điểm theo môn được giao hoặc quyền chủ nhiệm. Học sinh không được ghi dữ liệu, chỉ xem thông tin chung và bản ghi của mình. Phụ huynh nhận email; chưa có cổng phụ huynh riêng.

## Kiểm thử

`node --test server/platform/management.test.js` dùng PostgreSQL PGlite thật, kiểm tra phạm vi, danh sách học sinh, điểm/hệ số, cập nhật chuyên cần, tính trung bình và hàng đợi email. Không gửi email thật.
