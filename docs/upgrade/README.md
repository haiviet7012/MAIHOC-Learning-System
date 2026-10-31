# MAIHOC School và Learning

Bản nâng cấp này chuyển giao diện MAIHOC sang hai không gian School và Learning, đồng thời bổ sung nền tảng trường học, câu hỏi có phiên bản và phiên làm bài phía server. Express trên Render, PostgreSQL qua adapter hiện tại, cookie `maihoc.sid`, các ID cũ và R2 key được giữ lại.

Đây là PR để rà soát và thử nghiệm trước khi phát hành. Không có migration, backfill hay lời gọi Gemini/R2 production nào được chạy khi tạo PR. Việc khởi tạo một backend kiểm thử không xác minh được cấu hình production.

## Những chức năng được triển khai

| Nhóm | Thay đổi thực tế |
| --- | --- |
| Giao diện | Sidebar responsive School/Learning, dashboard lấy dữ liệu thật, màu navy/pastel, menu mobile, focus/skip link, dark mode và giảm chuyển động |
| Tài khoản | Thiết kế lại đăng nhập, đăng ký và khôi phục/xác minh; giữ nguyên endpoint và cookie hiện tại |
| Điều hướng | URL cho School, Learning, tài liệu, bài kiểm tra, AI, tiến trình; refresh/deep link trên Worker và Express |
| Nhà trường | Tạo trường, năm học, học kỳ, lớp động; membership có vai trò trong từng trường |
| Học sinh | Xếp/chuyển lớp có lịch sử; nhập tối đa 200 email đã có tài khoản với validate toàn bộ trước khi commit |
| Giáo viên | Phân công chủ nhiệm/bộ môn theo lớp; môn học trong học kỳ; kiểm tra quyền tại backend |
| Curriculum | Phiên bản chương trình và chuyên đề theo trường/môn/khối; không gán chuyên đề giả cho lịch sử cũ |
| Question Bank | Nháp, duyệt, nguồn học liệu, MCQ, đúng/sai bốn ý, trả lời ngắn, tự luận; chỉnh sửa tạo phiên bản mới |
| Giao bài | Chọn câu đã duyệt, trọng số từng câu, lớp nhận bài, thời gian mở/đóng, thời lượng; chốt snapshot khi phát hành |
| Làm bài mới | Resume cùng attempt, deadline server, lưu nháp có version, bản nháp local, submit idempotent |
| Chấm | Chấm MCQ/số tương đương, đúng/sai lũy tiến; tự luận chờ giáo viên; sửa điểm có audit |
| Báo cáo | Kết quả theo bài/lớp được phân công, CSV có BOM và chống công thức bảng tính; thống kê đúng/sai theo chuyên đề |
| Luyện bổ sung | Từ tiến trình tạo bài luyện riêng tối đa 10 câu đã duyệt trong chuyên đề, không lộ answer key cho học sinh |
| AI | Gợi mở, kiểm tra bài làm, giải nhanh/chi tiết; trợ giảng tạo ý tưởng nháp; chặn AI theo danh tính đang có phiên kiểm tra; model cấu hình tập trung |
| AI nền | API enqueue/poll, worker PostgreSQL riêng, claim/lease/retry, giới hạn yêu cầu, trả kết quả đúng người gửi; UI khôi phục job văn bản khi bật worker |
| Bài kiểm tra cũ | Kiểm tra lớp/khối và hạn đóng tại submit; phiên server và autosave khi bật nền tảng; retry không tạo lượt nộp thứ hai |
| Tương thích roster | Trigger giao dịch chiếu membership/enrollment theo đúng trường/năm đã bootstrap; không đưa trường/năm mới vào namespace class_code cũ |
| Phòng tự học | Pomodoro chung do chủ phòng điều khiển; tùy chọn lưu metadata/password hash/timer trong PostgreSQL để phòng có thể được tìm lại sau restart |
| Vận hành | Migration có checksum/transaction/advisory lock; plan-only mặc định; bootstrap riêng; tách maintenance nặng khỏi startup; R2 inventory chỉ đọc |
| Build và CI | JS/CSS minify và tên theo content hash; manifest; kiểm tra source/dist; hồi quy cũ, integration và Playwright |

## Phạm vi cần hiểu đúng

- Lớp mới và dữ liệu School mới dùng `/api/platform/*`. Bài kiểm tra PDF/DOCX, chấm deferred, xuất XLSX và lịch sử cũ vẫn dùng API hiện tại.
- Bài làm mới không bị ép thành dữ liệu legacy thiếu trường/năm/lượt làm. Portal mới đọc bảng canonical; portal cũ đọc bảng cũ. Roster có projection riêng sau bootstrap; điểm lịch sử và file không được đổi ID hay đoán lại năm học.
- Mỗi assignment mới hiện có một lượt làm cho một học sinh. Bài luyện bổ sung tạo assignment cá nhân mới. Chính sách nhiều lần thi, nhóm tự chọn và accommodation chưa có UI cấu hình đầy đủ.
- Trọng số câu hỏi được hỗ trợ; bộ sinh đề tự động theo ma trận nhiều chiều, OCR nhập câu hàng loạt và ngân hàng nội dung THPT đầy đủ là công việc tiếp theo.
- Thống kê chuyên đề là quan sát mô tả, có hiển thị số mẫu. Chưa có mô hình ML hoặc kết luận năng lực chuẩn hóa.
- Worker mới phục vụ AI Tutor văn bản. Pipeline giải đề PDF/OCR cũ vẫn giữ cơ chế phục hồi hiện có; chưa chuyển toàn bộ tác vụ đó sang worker mới.
- Signaling WebRTC và thành viên phòng vẫn dùng cơ chế hiện có. Metadata/timer có thể lưu bền; stream, peer connection và chat không được khôi phục nguyên trạng. Chưa triển khai SFU hoặc chạy nhiều backend instance.
- Upload trực tiếp bằng presigned URL, multipart/streaming toàn bộ file, RLS, SSO qua subdomain, ERP/điểm danh/sinh trắc học không thuộc lần phát hành này. Không đưa dữ liệu sinh trắc từ template vào MAIHOC.
- Không xóa BYTEA cũ. `MAIHOC_R2_ONLY` chỉ thay đổi một số đường ghi upload tài liệu chung; chưa loại bỏ mọi ghi dự phòng ở mọi module.

## Kiến trúc và quyền

`Browser → Cloudflare Worker → Express/Socket.IO trên Render → PostgreSQL + R2`.

`server/platform/policy.js` kiểm tra membership và phân công lớp/môn. API không tin `schoolId` từ client. FK tổng hợp bảo vệ quan hệ trường–năm–lớp. Học sinh không gọi được Question Bank chứa đáp án; API bắt đầu bài chỉ trả nội dung hiển thị. Assignment chốt snapshot, không đổi nội dung khi tác giả tạo phiên bản câu mới.

`server/postgres.js` vẫn là adapter chung. SQL mới dùng `db.query()` và cùng transaction context, không tạo pool riêng cho từng domain. `learning_results.record_key` cũ giữ ý nghĩa tổng hợp; không coi đó là lịch sử mọi attempt.

Đọc [DEPLOYMENT.md](DEPLOYMENT.md) trước khi bật nền tảng và [VERIFICATION.md](VERIFICATION.md) để biết phạm vi kiểm thử.
