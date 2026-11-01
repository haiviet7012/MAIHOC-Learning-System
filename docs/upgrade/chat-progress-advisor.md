# Chat, hành trình tự học và cố vấn

Khởi động backend sẽ dọn các cuộc trò chuyện direct còn ít hơn hai tài khoản tồn tại. Trigger PostgreSQL BEFORE DELETE trên users xóa toàn bộ thread direct liên quan (kể cả tin của người còn lại trong thread đó). Tin trong phòng chung của tài khoản bị xóa được xóa theo FK cascade hiện có. Những cuộc trò chuyện giữa tài khoản còn tồn tại được giữ lại. Socket thông báo cho trình duyệt tải lại danh sách và đóng kết nối của tài khoản bị xóa. Đây là xóa dữ liệu thực, không chỉ ẩn tên trên UI.

Hành trình tự học hiển thị năm hàng cao 132px, các hàng tiếp theo cuộn trong khung. Cố vấn Learning và School dùng ngăn kéo bên phải: bấm tab để mở, × hoặc Escape để đóng, có animation và hỗ trợ reduced motion. Các khung/box/tab và pseudo-element dùng góc vuông trên toàn web.

Cố vấn bật mặc định; MAIHOC_LEARNING_ADVISOR_ENABLED=0 vẫn tắt rõ ràng. Ưu tiên LEARNING_ADVISOR_API_KEY/LEARNING_ADVISOR_MODEL, nếu thiếu dùng GEMINI_API_KEY/GEMINI_MODEL. Không hardcode key/model hoặc gửi truy vấn AI thật trong kiểm thử.

Nếu database chưa có migration 006, chạy quy trình migration hiện có: sao lưu và kiểm tra khôi phục, đặt MAIHOC_BACKUP_VERIFIED=1 trên backend production, chạy npm run db:migrate. Không sửa checksum migration cũ. API báo rõ thiếu schema thay vì lỗi truy vấn chung. Cần API key/model hợp lệ để AI trả lời; dữ liệu và biểu đồ vẫn dùng database.

PR không kết nối hoặc xóa dữ liệu production trực tiếp. Dọn chat cũ chạy khi backend triển khai bản mới và khởi động thành công.
