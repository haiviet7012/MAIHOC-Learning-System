# Gỡ hai chức năng School

Đã gỡ “Giao và quản lý bài” và “Quản lý nhà trường” khỏi menu, trang, đăng nhập và điều hướng School. `/school` và các liên kết cũ của hai trang chuyển về “Lớp của bạn”.

Các file giao diện quản lý, tổng quan cũ và bộ chọn năm học riêng đã được xóa. Backend không còn cài router quản lý nhà trường; bỏ API phát hành đề thủ công, xem/xuất kết quả và sửa điểm của trang giao/quản lý bài.

| Đường dẫn `/api/platform` đã gỡ | Phương thức |
| --- | --- |
| `/schools/:schoolId/management` và các đường dẫn con | GET, POST |
| `/schools/:schoolId/assignments` | POST |
| `/schools/:schoolId/assignments/:assignmentId/results` | GET |
| `/schools/:schoolId/assignments/:assignmentId/export` | GET |
| `/schools/:schoolId/attempts/:attemptId/grade` | POST |

Các API dùng chung về trường, năm học, lớp, phân công, thành viên, ngân hàng câu hỏi và kết quả học tập được giữ. Học sinh vẫn đọc/làm/nộp bài đã có, luyện chuyên đề và nhận bài phụ đạo từ engine School. “Kiểm tra và luyện thi” dùng module riêng và tiếp tục tạo đề, giao bài, chấm bài như trước.

Không xóa bảng, sửa migration cũ hoặc xóa dữ liệu sản xuất: lớp, quyền truy cập, đề đã phát hành và báo cáo lịch sử vẫn cần những khóa tham chiếu này. Hàm tính điểm trung bình được chuyển sang `server/grade-summary.js` để báo cáo lớp tiếp tục đọc điểm/chuyên cần cũ mà không phụ thuộc router đã gỡ. Thời khóa biểu cá nhân và quản trị tài khoản (cấp gói School) vẫn giữ nguyên.

Kiểm tra hồi quy: `npm run test:school-management-options` chạy kiểm tra gỡ module, liên kết cũ, menu còn lại và HTTP 404 cho API đã gỡ. `npm run test:platform` tiếp tục kiểm tra lượt làm bài, bài nộp, chấm tự động, phân quyền và dữ liệu lịch sử với fixture DB độc lập thay vì API phát hành đã gỡ.
