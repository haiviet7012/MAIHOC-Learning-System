# Tài khoản học sinh, giáo viên và quyền School

## Hành vi

- Đăng ký công khai có hai lựa chọn: Học sinh và Giáo viên. Học sinh mới luôn có Learning đầy đủ (theo phạm vi Learning mới), không thể tự cấp School bằng `accountType`, `classCode`, `schoolPlan` hay `role` trong request.
- Switch School luôn hiển thị, kể cả khách. Người chưa có quyền thấy tab Gói & thanh toán với duy nhất School Standard. Học sinh có thể tự mua; người có vai trò school_admin của trường (hoặc Super Admin) có thể mua theo số lượng và cấp quyền cho học sinh đang là thành viên trường. Thanh toán chuyển khoản VietQR qua SePay; quyền chỉ được kích hoạt sau khi backend xác thực webhook và đối chiếu giao dịch.
- Giáo viên mới phải xác minh hộp thư có domain kết thúc `.edu.vn`, sau đó mới mở hồ sơ họ tên, mật khẩu, loại giáo viên, bộ môn, lớp chủ nhiệm và các lớp dạy. Xác minh email chỉ xác nhận sở hữu hộp thư, không xác thực độc lập tình trạng công tác.
- OTP hiệu lực 10 phút, tối đa 5 lần thử; 60 giây giữa hai lần gửi cùng email và tối đa 5 yêu cầu/15 phút theo hash IP. Mã và token được lưu dưới dạng hash; không trả mã trong response/log. Chứng thực chỉ dùng một lần, ràng buộc email phía server; tạo giáo viên và phân công trong một transaction. Mất cấu hình mail thì không bỏ qua xác minh.
- “Thêm giáo viên” trong Admin được thay bằng “Thêm người quản lý”: chỉ nhập Gmail. Tài khoản tồn tại được nâng quyền, không đổi mật khẩu/dữ liệu; Gmail mới được tạo tài khoản với mật khẩu ngẫu nhiên không công bố và nhận lời mời dùng Quên mật khẩu để tự đặt mật khẩu. Thiếu mail hoặc URL công khai thì không tạo tài khoản mới.
- Quản lý có quyền quản trị hiện hành nhưng không được xóa tài khoản người khác, xử lý yêu cầu xóa tài khoản, cấp quyền quản lý hoặc giám sát ẩn trong phòng tự học. Các hạn chế được kiểm tra trên backend theo session, không chỉ ẩn nút.
- Cố vấn AI chuyển khỏi tiến trình Learning, có mục trong School. Giữ dữ liệu/lộ trình cũ, tái sử dụng API đã có nhưng chặn tài khoản không có School. Giáo viên mở Cố vấn giảng dạy từ School.
- IELTS có mục riêng trong School, bị bỏ khỏi kho môn Learning; chặn tài liệu/file và yêu cầu AI IELTS của tài khoản không có School. Trạng thái nội dung/assessment theo cấu hình môn hiện có, không tự mở các assessment còn chưa triển khai.

## Tương thích và dữ liệu

Thêm `users.school_plan` (none/legacy/standard), `users.school_expires_at`, `users.is_manager` và bảng `teacher_signup_challenges`. Không đổi ID, email, mật khẩu, vai trò, phân công hoặc lịch sử của tài khoản cũ. Premium bị loại khỏi danh mục; các bản ghi Premium cũ được chuyển thành Legacy để giữ quyền School grandfathered. Vai trò kỹ thuật cũ vẫn được giữ để không phá liên kết backend hiện hành; hai loại đăng ký là phân loại giao diện/sản phẩm.

Migration có đánh dấu `app_migrations.account-plans-v1`, chạy một lần trong transaction với advisory lock. Các tài khoản School/thành viên lớp có sẵn được gán quyền `legacy`. Tài khoản Learning ngoài trường cũ tiếp tục dùng Learning. Tài khoản giáo viên Gmail đang tồn tại vẫn đăng nhập; quy tắc edu áp dụng cho đăng ký giáo viên mới. Restart không tự nâng học sinh mới lên legacy.

Giữ start command `node server.js`, PostgreSQL/R2 hiện hành. DB user cần quyền ALTER/CREATE. Deploy backend và dist cùng commit. Chạy backup theo quy trình vận hành trước deploy; kiểm tra một tài khoản cũ và một học sinh mới sau deploy. Không dùng rollback DB bằng cách xóa các cột/bảng mới vì sẽ mất trạng thái quyền.

## Kích hoạt School trước khi có thanh toán

Billing dùng các bảng `billing_orders`, `billing_order_recipients`, `billing_transactions`, `billing_subscriptions` và `billing_reminders`; giá/thời hạn được snapshot trong đơn, webhook SePay được xác thực HMAC và xử lý idempotent. Gia hạn sau thanh toán nối tiếp thời hạn hiện tại. Reminder email + thông báo nội bộ được xếp hàng trước 7 ngày. Admin vẫn có thể cấp quyền thủ công bằng endpoint có xác thực và same-origin:

`PUT /api/admin/users/:id/school-plan` với JSON `{"plan":"standard"}`; `none` thu hồi quyền. API từ chối cấp mới giá trị `premium`. Các bản ghi `premium` đã tồn tại vẫn được giữ nguyên và tiếp tục có quyền truy cập để tránh gián đoạn tài khoản cũ. Không áp dụng cho giáo viên/Admin. Đơn nhà trường lưu danh sách học sinh nhận quyền và chỉ cho phép người có school_memberships.role='school_admin' đang hoạt động (hoặc Super Admin) mua. Học sinh chỉ được xem đơn của tài khoản mình hoặc đơn mà mình là người nhận. Migration Billing là platform:008_school_standard_billing.sql; phải chạy qua npm run db:plan/db:migrate sau khi backup và diễn tập restore.

SMTP/Resend và APP_PUBLIC_URL dùng lại cấu hình email hiện hữu. Không dùng email production để chạy bộ test. Worker thông báo bài/giáo viên vẫn giữ nguyên.

## Kiểm tra

- `node --test server/tests/account-upgrade.test.js`: migration lặp, bảo toàn mật khẩu cũ, không tự cấp gói, edu/token/email binding, single-use, phân công, manager API restrictions và lời mời Gmail (mock SMTP).
- `npm run test:account-upgrade`: đăng ký qua giao diện bằng OTP mock, giữ hồ sơ ẩn trước xác minh, trung tâm tài khoản giáo viên/mobile và vị trí Cố vấn.
- Các bộ auth, School access, Learning, advisor, browser và thông báo được cập nhật theo phân quyền mới; không bỏ qua kiểm tra bị ảnh hưởng.


## Chat riêng sau khi được cấp School

Quyền chat riêng theo `canAccessSchool(user)` từ tài khoản đã xác thực, áp dụng cả School Standard được Admin cấp miễn phí không thời hạn. Không yêu cầu phải đang đứng ở giao diện School: user đã có quyền có thể mở chat riêng khi đang ở Learning. User chưa có gói vẫn được dẫn tới trang đăng ký School; API vẫn yêu cầu cả người gửi và người nhận có quyền School.

Khi mở tab tin nhắn riêng hoặc mở chat từ danh sách online, widget đọc lại `/api/auth/me` với no-store trước khi quyết định khóa quyền. Widget cũng đồng bộ khi có `maihoc-user-updated`; không chỉ khi đăng nhập/đăng xuất. Cấp gói lúc trang đang mở vì vậy không đòi hỏi đăng nhập lại. Lỗi API quyền tạm thời hiển thị thông báo thử lại, không tự suy ra user thuộc Free. Không ngắt/tạo lại kết nối Socket.IO chỉ để làm mới quyền cùng tài khoản; API và socket vẫn kiểm tra membership/quyền trực tiếp từ DB.

`npm run test:account-upgrade` bao gồm hồi quy cấp School và chat riêng: trang Learning mở trước khi cấp, Admin cấp qua UI, user gửi tin qua Socket.IO thật và đọc lại lịch sử qua API, cùng kiểm tra user Free và lỗi API quyền. Toàn bộ dùng PostgreSQL preview cô lập, không kiểm tra hoặc sửa tài khoản sản xuất.
