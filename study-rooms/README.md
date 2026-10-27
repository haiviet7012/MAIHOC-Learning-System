# Phòng tự học — MAI HỌC

Module phòng học trực tiếp, được tách riêng để dễ bảo trì:

- `study-rooms/client.js`: lobby, chat, camera/microphone, giơ tay và WebRTC peer connections.
- `study-rooms/styles.css`: giao diện responsive.
- `server/study-rooms/server.js`: API tạo phòng, tham gia, tín hiệu WebRTC, chat, ảnh và quản lý thành viên.

## Cách dùng

1. Đăng nhập MAI HỌC và bấm **Phòng tự học** trên thanh điều hướng.
2. Chọn **Tạo phòng**, nhập tên và tùy chọn đặt mật khẩu. Bỏ trống mật khẩu để mở phòng cho mọi người dùng đã đăng nhập.
3. Bạn bè chọn phòng trong danh sách và nhập mật khẩu nếu được yêu cầu.
4. Trong phòng, người dùng có thể bật/tắt microphone, camera, giơ/hạ tay, chat chữ và gửi ảnh (tối đa 2 MB mỗi ảnh).
5. Phòng giới hạn 12 học viên. Phòng trống sẽ tự hết hạn sau vài phút.

## Kỹ thuật và giới hạn

- Không cần thêm thư viện npm mới; module dùng Express/SQLite/auth hiện tại và HTTP polling để chuyển tín hiệu cùng chat.
- Audio/video chạy peer-to-peer bằng WebRTC và STUN. Một số mạng NAT/firewall cần TURN server để kết nối media ổn định; bản này chưa cấu hình TURN.
- Camera/microphone cần được người dùng cấp quyền trên trình duyệt và thường cần HTTPS ở môi trường production (localhost được trình duyệt cho phép).
- Phòng và lịch sử chat đang nằm trong bộ nhớ của tiến trình Node.js; khi server khởi động lại, các phòng đang hoạt động và lịch sử chat sẽ mất.
- Admin có quyền vào bất kỳ phòng nào để giám sát. Khi Admin tham gia, giao diện hiển thị thông báo/nhãn **Admin đang giám sát** cho người tham gia; chức năng không có chế độ tham gia bí mật.
- Chưa ghi âm/ghi hình tự động. Hình ảnh chat được giữ trong bộ nhớ giới hạn theo lịch sử gần nhất của phòng.

## Tích hợp

Backend được mount trong `server/server.js`, trang được đăng ký qua router `js/app.js`, nút điều hướng nằm trong `index.html`, kiểu dáng module nằm ở `study-rooms/styles.css`.
