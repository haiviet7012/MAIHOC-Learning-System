# Rà soát bản thảo chính sách quyền riêng tư

Trang: public/privacy.html, truy cập /privacy.html sau deploy. Đây là bản thảo có noindex và thông báo trạng thái, chưa liên kết footer để tránh hiểu nhầm là chính sách đã ban hành. Không dùng làm chính sách chính thức cho Google trước khi xử lý các mục còn thiếu.

## Cần chủ hệ thống xác nhận

- Tên/địa chỉ đơn vị hoặc cá nhân vận hành, URL website và email tiếp nhận quyền riêng tư.
- Ngày hiệu lực; thời hạn lưu/xóa dữ liệu, nhật ký, sao lưu và email đã gửi.
- Quy trình yêu cầu truy cập/sửa/xóa, thời hạn phản hồi, các ngoại lệ cần giữ dữ liệu.
- Cơ chế sử dụng của học sinh chưa thành niên và phụ huynh/người giám hộ.
- Provider đang bật, khu vực lưu trữ, điều khoản Gemini theo tài khoản thực tế và cách thông báo giám sát phòng tự học.

Ảnh tham khảo đề xuất nhiều mục footer. Yêu cầu hiện tại chỉ soạn chính sách quyền riêng tư, không tạo điều khoản sử dụng hoặc chính sách bản quyền.

## Căn cứ từ repo

| Nội dung | Mã nguồn đối chiếu |
|---|---|
| Tài khoản, cookie, băm mật khẩu, vai trò | server/auth.js; server/postgres.js |
| Khôi phục/đổi/xóa tài khoản, OTP | server/server.js; js/account-features.js |
| Link xác nhận email trường | server/account-upgrade.js |
| Gmail API chỉ gửi, tài khoản hệ thống | server/gmail-mail.js; server/mail-delivery.js |
| Thông báo đúng phạm vi lớp/khối | server/school-notifications.js |
| Dữ liệu/ngữ cảnh Gemini | server/learning-advisor/gemini.js; server/ai-provider.js |
| Giám sát Admin ẩn trong phòng | server/study-rooms/server.js |
| Tiến trình, bài làm, chat, lịch sử AI | server/postgres.js; server/platform/migrations |
| Bản nháp/dữ liệu trình duyệt | js/platform/test-draft.js; js/platform/portal.js; js/account-features.js |
| Dịch vụ triển khai dự kiến | server/.env.example |

Repo phản ánh khả năng kỹ thuật, không chứng minh cấu hình production hoặc cam kết vận hành. Bản thảo cố ý không khẳng định thời hạn xóa, không ghi số liệu pháp lý chưa kiểm chứng và không cam kết nhà cung cấp AI không lưu/huấn luyện trên dữ liệu. Không ghi email người dùng trong ảnh đăng nhập làm email hỗ trợ của MAIHOC.
