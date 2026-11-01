# Learning cá nhân và thời khóa biểu

## Chức năng

- `/learning/progress` đọc `/api/progress` của chính tài khoản đăng nhập; chỉ hiển thị lesson/document/exam/practice. Các bản ghi test của School không nằm trong thống kê này. Không sửa hoặc xóa lịch sử cũ.
- `/school/progress` giữ báo cáo/chuyên đề và bài luyện từ kết quả School riêng; đường dẫn sau nộp bài School trỏ về báo cáo này.
- Trang Learning không gọi context hoặc analytics School để hiển thị tiến trình, nên hoạt động khi `MAIHOC_PLATFORM_ENABLED=0` và không yêu cầu membership trường.
- Box “Thời khóa biểu” ở tổng quan đọc lịch đã lưu. Chưa có lịch thì hiển thị “Thiết lập thời khóa biểu của bạn”; đã có lịch thì có “Sửa thời khóa biểu hiện tại” và “Tạo thời khóa biểu mới”.
- `/learning/timetable`: sidebar môn học, bảng tuần 7 ngày với 4 khung giờ cố định. Kéo môn từ sidebar vào ô, hoặc chọn môn rồi bấm/Enter tại ô (phù hợp cảm ứng và bàn phím). Chọn Xóa ô để bỏ môn. Lưu là thao tác riêng.
- Tạo mới có xác nhận. Hủy giữ nguyên lịch. Đồng ý tạo một bản nháp trống; lịch trên server chỉ được thay khi nhấn Lưu.
- Font giao diện dùng Raleway từ Google Fonts với các weight 400–800, tiêu đề ExtraBold 800. Giữ font chuyên dụng cho công thức toán để tránh mất ký hiệu.

## Backend và triển khai

Deploy cả frontend và Express. Backend tạo bổ sung bảng `learning_timetables` bằng `CREATE TABLE IF NOT EXISTS` trong bước khởi tạo runtime hiện có, sau khi schema tài khoản sẵn sàng. Không cần bật School hoặc chạy platform bootstrap để dùng lịch cá nhân.

Bảng có `user_id` khóa chính/FK users với ON DELETE CASCADE, `cells` JSONB, `version` và `updated_at`. Không xóa hoặc đổi cột ở bảng đang dùng. Quay về code cũ không cần drop bảng này.

GET/PUT `/api/learning/timetable` yêu cầu đăng nhập; PUT còn kiểm tra same-origin. User ID lấy từ session. Validate tối đa 28 ô, chỉ nhận key 0–3 / 0–6 và danh mục môn cho phép. Ghi lịch dùng version để tránh hai tab ghi đè nhau; phiên bản cũ trả 409. Không có endpoint xóa lịch ngay khi bấm Tạo mới.

## Kiểm chứng

`npm run test:learning` khởi động Express với database PGlite cô lập và School tắt; kiểm tra kéo thả, bàn phím, mobile, lưu/tải lại, xác nhận lịch mới, validation, ownership, CSRF và stale version. Mật khẩu fixture sinh ngẫu nhiên mỗi lần chạy. Font CDN bị chặn trong bài test để không phụ thuộc mạng; bài test kiểm tra font-family cấu hình, không xác nhận CDN/font thực tế trên production.

Các kiểm thử không truy cập PostgreSQL/R2/Gemini production. Khung giờ hiện cố định, chưa có nhiều lịch đồng thời, thông báo nhắc lịch hoặc xuất iCal.
