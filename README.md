# MAI HỌC — website học tập & luyện thi

Nền tảng học tập với giao diện Montserrat, chế độ sáng/tối, tài liệu học tập, phòng thi thử 90 phút, tài khoản User/Admin và hệ thống duyệt tài liệu.

## Phòng tự học

Phòng tự học được tích hợp trên thanh điều hướng. Người dùng đã đăng nhập có thể tạo phòng có/không có mật khẩu, xem danh sách phòng đang hoạt động, tham gia video call bằng WebRTC, bật/tắt camera và microphone, chat chữ/ảnh, giơ tay và xem danh sách người tham gia. Mỗi phòng cho tối đa 12 học viên.

Mã nguồn được tách riêng tại:
- `study-rooms/client.js` — giao diện phòng học và WebRTC.
- `study-rooms/styles.css` — kiểu dáng.
- `server/study-rooms/server.js` — API, phân quyền, room state và signaling.
- `study-rooms/README.md` — hướng dẫn, giới hạn kỹ thuật và triển khai.

Admin có thể giám sát bất kỳ phòng nào; khi tham gia, ứng dụng hiển thị nhãn thông báo cho các thành viên. Phòng và chat được lưu trong bộ nhớ của tiến trình nên sẽ hết khi server khởi động lại. WebRTC dùng STUN; production có thể cần cấu hình TURN và HTTPS để tương thích tốt hơn với các mạng khác nhau.

## Chạy ứng dụng

```powershell
cd server
npm install
npm start
```

Mở `http://localhost:3000`. Camera/microphone cần được trình duyệt cấp quyền; môi trường production nên dùng HTTPS.
