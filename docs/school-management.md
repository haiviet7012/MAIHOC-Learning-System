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

## Biểu đồ, báo cáo và nhận xét riêng

- Giáo viên mở Lớp của bạn → thẻ lớp để xem biểu đồ lớp và xuất PDF/Excel. Trên từng thẻ học sinh, nút Tiến độ học chi tiết mở tab mới với dữ liệu cá nhân, biểu đồ và hộp feedback.
- Quản lý nhà trường cũng có biểu đồ/báo cáo cho lớp đã chọn. Dữ liệu điểm/chuyên cần lấy từ sổ điểm mới; lớp cũ dùng legacy_class_mappings để xác định đúng trường/lớp. Nếu chưa có ánh xạ thì không bịa số liệu và vẫn hiển thị hoạt động học tập tài khoản.
- Chuyên cần tính (có mặt + muộn) / lượt đã ghi nhận, không tự coi ngày chưa điểm danh là vắng. Không có lượt ghi nhận sẽ hiển thị chưa có dữ liệu.
- Điểm trung bình theo ngày ghi/cập nhật được tách môn/học kỳ, tính trung bình có hệ số của từng học sinh rồi lấy trung bình các học sinh có điểm ngày đó. Hiển thị số học sinh để tránh nhầm khi số mẫu thay đổi. Đây chưa phải chuỗi snapshot của tất cả lần sửa điểm; dữ liệu cột điểm hiện tại là nguồn báo cáo.
- Hoạt động user_progress là trạng thái hiện tại, điểm gốc chưa có thang điểm được giữ nguyên, không trộn với điểm /10 trong biểu đồ.
- Excel gồm tổng hợp, điểm/chuyên cần, dữ liệu biểu đồ, hoạt động và ghi chú. PDF dùng font Unicode DejaVuSans có sẵn, hỗ trợ tiếng Việt, tổng hợp và chi tiết. Xuất báo cáo chỉ lấy dữ liệu đã qua kiểm tra quyền trên backend.
- Feedback được lưu bằng notifyUser vào notifications đúng một học sinh thuộc lớp; không đăng lên bảng tin hay gửi toàn lớp, không tự gửi email phụ huynh.
- Không cần migration mới cho báo cáo/feedback ngoài migration 011 đã dùng cho sổ điểm/chuyên cần. Cần deploy cả backend và frontend.

## Bố cục quản lý và năm học

Quản lý nhà trường chỉ giữ các khối rộng toàn trang, cách nhau 24px: năm học, lịch/sự kiện, sổ điểm, chuyên cần (chủ nhiệm/quản trị), thêm học kỳ (quản trị), xếp/chuyển lớp (chủ nhiệm/quản trị). Sổ liên lạc/bảng tin và các form quản trị khác được bỏ khỏi trang; dữ liệu cũ không bị xóa.

Bộ chọn năm học có bốn lựa chọn dựa theo năm lịch tại Việt Nam: năm hiện tại trừ 1 đến năm hiện tại cộng 2. Ví dụ 2026: 2025–2026 đến 2028–2029; sang 2027 sẽ thành 2026–2027 đến 2029–2030. Chọn năm lọc lớp và form học kỳ; tạo năm chưa có dùng khoảng mặc định 01/08–31/07, không sửa các năm đã lưu. Học kỳ mới phải là năm.kỳ, ví dụ 2025.1/2025.2, khớp năm học được chọn. Tên học kỳ cũ không tự đổi.

Giáo viên bộ môn không ghi/xem dữ liệu chuyên cần trong quản lý và báo cáo; API điểm danh/xếp lớp kiểm tra quyền chủ nhiệm hoặc quản trị. Giáo viên chủ nhiệm chỉ xếp vào lớp mình chủ nhiệm; chuyển học sinh từ lớp khác cũng cần quyền chủ nhiệm lớp nguồn, nếu không phải nhờ quản trị trường. Quản trị có thể chuyển trong phạm vi trường.

Thời khóa biểu hỗ trợ thêm GDQP-AN và GDDP, kể cả nhập/xuất Excel và lưu backend.
