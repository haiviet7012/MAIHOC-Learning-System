# Cố vấn giảng dạy và lộ trình dựa trên dữ liệu

Cố vấn học tập bỏ bảng điểm, biểu đồ và khối số liệu khỏi giao diện. Mỗi yêu cầu thiết kế/đánh giá vẫn truy vấn snapshot ở backend, gồm kết quả đã chấm và tiến trình học liệu của tài khoản. Cố vấn School bổ sung tiến trình học liệu vào context. Chỉ dẫn AI yêu cầu dùng dữ liệu để chọn nội dung, mức độ và nhịp học; không liệt kê điểm.

Tài khoản giáo viên có ngăn kéo Cố vấn giảng dạy trên các trang, cùng vị trí và thao tác mở/đóng với Cố vấn học tập. Hai chế độ: thiết kế bài giảng và thiết kế lộ trình. Chọn lớp được phân công, nhập môn và yêu cầu; chọn học sinh là tùy chọn. Để trống học sinh sẽ dùng dữ liệu cả lớp. Giáo viên bộ môn chỉ truy vấn môn được phân công; giáo viên chủ nhiệm có thể chọn môn trong lớp phụ trách.

Backend /api/teaching-advisor kiểm tra vai trò giáo viên, lớp được phân công và học sinh đang thuộc lớp ở mỗi yêu cầu. Hỗ trợ cả school_teacher_assignments/school_class_members cũ và teacher_course_assignments/student_enrollments mới. Với School mới, chỉ đọc kết quả cũ khi có legacy_class_mappings tương ứng. Lớp hiện hoạt và membership giáo viên hiện hoạt là bắt buộc cho School mới. Không cấp quyền qua dữ liệu client hoặc cho học sinh truy cập endpoint giáo viên.

Dữ liệu được đọc mới khi bấm tạo: tiến trình user_progress, kết quả Learning đã chấm và kết quả School trong đúng lớp/môn. Client không gửi điểm, tiến trình hoặc nội dung prompt hệ thống. Context gửi AI không có email, tên hoặc ID học sinh; kết quả lớp được tổng hợp, tiến trình có tiêu đề học liệu và trạng thái. Học liệu/tên chủ đề vẫn là dữ liệu không đáng tin để làm chỉ dẫn. Giới hạn 200 học sinh/lớp; 1.000 dòng tiến trình, 2.000 kết quả mỗi nguồn; mặc định 30 ngày, tối đa 90 ngày cho kết quả. Thiếu dữ liệu được nêu là thiếu, không gán điểm 0.

Dùng cùng cấu hình LEARNING_ADVISOR_API_KEY/MODEL, hoặc GEMINI_API_KEY/MODEL khi chưa cấu hình riêng. MAIHOC_LEARNING_ADVISOR_ENABLED=0 tắt cả hai. Rate limit ghi database learning_advisor_calls: 20 lượt/giờ, 100 lượt/ngày/tài khoản. Không thêm migration; cần schema School và migration Cố vấn hiện có. Không tự đổi điểm hoặc giao lộ trình vào tài khoản học sinh.

Bản thiết kế giáo viên là bản nháp trong ngăn kéo hiện tại, để giáo viên rà soát và yêu cầu tạo lại. Chưa lưu lịch sử thiết kế giáo viên qua tải lại trang, chưa tự phân phối bài giảng/lộ trình cho lớp. Lộ trình cá nhân của học sinh tiếp tục dùng lưu/áp dụng hiện có.

Kiểm tra: server/platform/teaching-advisor.test.js dùng DB tách biệt và generate giả; bao phủ phân quyền lớp/môn/học sinh, dữ liệu thay đổi đọc lại, bỏ qua điểm giả từ client, cả lớp và một học sinh, lớp legacy/School mới, thu hồi phân công. test:advisor kiểm tra không có bảng/biểu đồ điểm trên giao diện, hai chế độ giáo viên, chọn lớp/tên và mobile; provider AI giả lập, không gửi dữ liệu thật ra ngoài trong test.
