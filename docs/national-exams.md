# Luồng đề thi THPT Quốc gia

Mở menu **Đề thi THPT quốc gia** → chọn đề → làm bài → nộp bài → xem điểm, đáp án, lời giải và phân tích. Nút **Hỏi Gia sư AI về câu này** đưa đề, phương án, bài làm và đáp án chuẩn vào ô nhập Gia sư AI; người học chủ động gửi yêu cầu.

## Dữ liệu mẫu

[JSON mẫu](../server/national-exam-mock.json) có sáu đề ngắn, mỗi đề bốn câu và tổng điểm 10. Đây là dữ liệu tự biên soạn để kiểm thử, không phải đề chính thức. Ngữ văn sử dụng phần đọc hiểu trắc nghiệm mẫu, không mô phỏng chấm tự luận.

Khi khởi động backend, `ensureNationalExamBank` tạo hai bảng `national_exam_bank`, `national_exam_sessions` nếu chưa có và thêm sáu đề mẫu theo ID cố định. `ON CONFLICT DO NOTHING` giữ nguyên đề đã được sửa và không tạo bản trùng. JSON chứa đáp án nằm trong thư mục server; API danh sách và phiên thi loại bỏ đáp án/lời giải.

## Quyền truy cập

| Tài khoản | Làm bài | Quản lý |
| --- | --- | --- |
| Student Learn | Free Learn | Không |
| Student School còn hiệu lực | Free Learn và Paid School | Không |
| Teacher | Free Learn và Paid School | Tạo và sửa đề của mình |
| Admin (cấp 2 trở lên) | Tất cả | Quản lý mọi đề, gồm đề mẫu |

Teacher/Admin mở form qua **+ Tạo đề thi mới** hoặc **Quản lý ngân hàng đề** trong header. Form hỗ trợ ABCD, bốn ý Đúng/Sai và trả lời ngắn bằng số, mức độ nhận thức, điểm, lời giải, gói học và trạng thái bản nháp/xuất bản. Tổng điểm phải bằng 10. Kiểm tra quyền, chủ sở hữu và phiên bản chỉnh sửa diễn ra tại API.

## Phiên thi và kết quả

Máy chủ tạo phiên với mốc bắt đầu, hạn nộp và bản chụp đề để chỉnh sửa sau đó không đổi đáp án của lượt thi đang làm. Trình duyệt giữ bản nháp và mã phiên theo tài khoản/đề. Nộp lại cùng mã phiên trả về kết quả đã lưu, tránh trùng lịch sử khi mạng bị gián đoạn.

Câu Đúng/Sai có tỷ lệ điểm 0 / 0,1 / 0,25 / 0,5 / 1 của điểm câu khi đúng 0–4 ý. Điểm toàn bài làm tròn hai chữ số; phân tích tỷ lệ đúng tính một câu Đúng/Sai là đúng khi đủ bốn ý đúng. Một câu có ít nhất một ý đã chọn nhưng chưa đúng đủ được tính vào nhóm sai, không tính bỏ trống.

Kết quả tài khoản được lưu chung vào `exam_attempts`, `user_progress`, `learning_results` và thông báo hoạt động. Có thể mở lại từ Kho Đề, Tiến trình học tập và Hoạt động gần đây. Kết quả khách được giữ trong phiên trình duyệt; khách cần đăng nhập trước khi thi để lưu vào tài khoản.

## Kiểm tra

```shell
npm test
node scripts/national-exam-flow-check.mjs
node scripts/exam-room-check.mjs
node scripts/national-exam-check.mjs
npm run build
npm run check:dist
```

Các kiểm tra trình duyệt dùng preview PostgreSQL/PGlite cô lập và Chrome cài sẵn, không sử dụng dữ liệu production. Có thể chọn trình duyệt tương thích qua biến môi trường `MAIHOC_BROWSER_CHANNEL`.
