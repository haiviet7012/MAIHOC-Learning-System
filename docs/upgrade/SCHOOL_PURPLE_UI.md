# School: giao diện tím và trắng

Phạm vi: làm mới giao diện School theo ba ảnh tham khảo do người dùng cung cấp, với bố cục thẻ thoáng, banner tím, góc bo tròn và phân cấp rõ ràng. Không sao chép logo/nội dung/số liệu minh họa trong ảnh.

## Hệ thống hiển thị

| Thành phần | Light | Dark |
|---|---|---|
| Nền trang | #f6f4fc | #130f20 |
| Thẻ / biểu mẫu | #ffffff | #20182f |
| Bề mặt phụ | #f1edfc | #2b2040 |
| Chữ chính | #272239 | #f6f2ff |
| Chữ phụ | #6e657f | #bcb0cf |
| Màu nhấn | #6d32f5 | #a681ff |
| Nút chính | Tím, chữ trắng | Tím đậm, chữ trắng |

Thẻ bo 20–28px, điều khiển 12px, nhãn dạng pill; trạng thái focus có viền tím, điều khiển giữ kích thước chạm tối thiểu. Các trạng thái thành công/cảnh báo vẫn có sắc thái riêng để truyền đạt ý nghĩa.

## Phạm vi áp dụng

- Khung điều hướng, thanh trên, trang quản lý/tổng quan và hồ sơ School.
- Gia sư, cố vấn học sinh/giáo viên, IELTS, thời khóa biểu, lớp học, bài giao, kiểm tra, kho câu hỏi và kết quả học tập.
- Công cụ beta: tài liệu/đáp án, vở AI, phòng học, màn hình 2D/3D và biểu mẫu/phản hồi liên quan.
- Các modal, cửa sổ chat, thông báo, danh sách online và nút nổi khi người dùng ở School.
- Thí nghiệm 2D mở trong School nhận cùng palette và đồng bộ light/dark với trang cha. Bản 2D mở độc lập từ Learning giữ giao diện hiện tại.

`body[data-school-ui]` giới hạn các token và override hình học cho School. Learning giữ bộ màu và góc vuông hiện tại. Route `/school/tutor` là lối vào School của cùng engine gia sư hiện có; bản chép vở chuyển tới đây để giữ đúng không gian. Không tạo engine AI mới hay đổi API gia sư.

Trang tổng quan dùng số lớp/năm học/thành viên và thông tin tài khoản từ API hiện có; không thêm biểu đồ hoặc số liệu giả. Thông tin thành viên không được API cung cấp hiện dấu — như trước.

## Kiểm tra và triển khai

- `npm run test:school-theme`: light/dark trên desktop 1440×1100, tablet 1024×1000, mobile 390×844; kiểm tra các route School, độ bo điều khiển, độ tương phản nhãn/điều hướng, tràn ngang, lưu/tải lại thời khóa biểu, đồng bộ theme iframe và cách ly Learning.
- Kiểm tra giáo viên gồm ngân hàng câu hỏi, quản lý bài giao và cố vấn giảng dạy.
- Các kiểm tra auth và advisor được cập nhật theo phạm vi giao diện mới: modal School có góc bo; tên tài khoản nằm giữa thanh trên School thay vì bắt buộc trùng tọa độ pixel với Learning.
- Build và check:dist; các kiểm tra root/platform/School beta và browser hồi quy tiếp tục dùng dữ liệu thử cô lập.

Không có migration mới, thay đổi schema, API, biến môi trường hoặc lệnh chạy Render. Các điều kiện bật School beta trong PR trước vẫn giữ nguyên. Sau khi merge chỉ cần triển khai lại frontend/backend từ commit mới theo pipeline hiện tại; Start Command vẫn là `node server.js`.
