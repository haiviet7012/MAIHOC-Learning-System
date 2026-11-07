# MAIHOC School Standard — SePay Billing

## Mô hình sản phẩm

- Chỉ có một SKU được bán: **standard / School Standard**.
- Học sinh mua cá nhân: một đơn hàng tạo một quyền sử dụng.
- Nhà trường mua: người mua phải là thành viên school_admin đang hoạt động của trường (hoặc Super Admin); một đơn chứa danh sách tối đa 200 học sinh đang có membership student trong trường.
- Giá và số ngày hiệu lực lấy duy nhất từ backend environment: SCHOOL_STANDARD_PRICE_VND và SCHOOL_STANDARD_DURATION_DAYS. Giá và thời hạn được snapshot trong đơn hàng; thay đổi cấu hình không sửa các đơn đã tạo.
- Khi thanh toán gia hạn trong lúc gói còn hiệu lực, subscription mới bắt đầu tại thời điểm hết hạn hiện tại. Khi đã hết hạn, subscription mới bắt đầu từ lúc webhook được xác nhận.
- Không có auto-debit ngân hàng. “Tự động gia hạn khi thanh toán” nghĩa là một khoản chuyển khoản hợp lệ cho đơn gia hạn mới tự động nối tiếp ngày hết hạn.

## Render Environment

Đặt các biến sau trên **backend Web Service** (không đặt trong frontend):

    SEPAY_ENABLED=0
    SEPAY_WEBHOOK_SECRET=
    SEPAY_ACCOUNT_NUMBER=
    SEPAY_BANK_CODE=
    SCHOOL_STANDARD_PRICE_VND=
    SCHOOL_STANDARD_DURATION_DAYS=
    BILLING_ORDER_EXPIRE_MINUTES=20

Điền các giá trị thực tế của bạn vào Render. Bật SEPAY_ENABLED=1 sau khi đã tạo webhook HMAC và kiểm tra cấu hình. BILLING_ORDER_EXPIRE_MINUTES tùy chọn, hợp lệ từ 5 đến 60 phút.

SEPAY_WEBHOOK_SECRET phải là Secret Key của phương thức **HMAC-SHA256** trên webhook SePay. Không dùng API token thay thế secret này. Không commit server/.env hoặc chia sẻ giá trị secret.

## SePay Webhook

- Method: POST.
- URL: https://<MAIHOC-DOMAIN>/api/billing/sepay/webhook.
- Sự kiện: có tiền vào.
- Tài khoản áp dụng: tài khoản ngân hàng đã cấu hình trong SEPAY_ACCOUNT_NUMBER.
- Bảo mật: HMAC-SHA256.
- Header: X-SePay-Signature: sha256=<hex> và X-SePay-Timestamp: <unix-seconds>.

Backend lưu raw request body qua express.json verify và xác thực HMAC trên chuỗi timestamp.raw_body. Không stringify req.body để tính lại chữ ký. Timestamp quá cũ hoặc chữ ký sai bị từ chối.

### Lưu ý bắt buộc khi dùng VietinBank API Banking

SePay yêu cầu nội dung thanh toán của giao dịch VietinBank bắt đầu bằng tiền tố `SEVQR`. Vì vậy MAIHOC tạo nội dung chuyển khoản và QR VietQR theo định dạng `SEVQR MAIHOC<14 ký tự hex>`. Backend vẫn trích xuất mã đơn `MAIHOC<14 ký tự hex>` từ nội dung có tiền tố, nên không thay đổi cấu trúc order code hoặc cơ chế đối soát. Giữ nguyên toàn bộ nội dung được hiển thị/copy từ trang thanh toán; không tự xóa tiền tố `SEVQR`.

SePay phải gửi JSON có các trường id, accountNumber, transferType, transferAmount và content. Giao dịch chỉ được xét khi transferType=in và tài khoản nhận khớp.

## Luồng mua và cấp quyền

1. Client gọi GET /api/billing/plans và GET /api/billing/options.
2. Tạo đơn bằng POST /api/billing/orders. Học sinh gửi buyerType=student. Nhà trường gửi buyerType=school, schoolId và studentIds.
3. Backend tự tính tổng tiền, snapshot giá/thời hạn, tạo mã đơn MAIHOC-<14 hex> và trả URL VietQR, số tài khoản, ngân hàng, số tiền và nội dung chuyển khoản.
4. SePay POST webhook. Backend xác thực HMAC, kiểm tra tiền vào, tài khoản nhận, mã đơn, số tiền, thời hạn đơn và ID giao dịch.
5. Trong **một transaction PostgreSQL**, backend ghi transaction duy nhất, đánh dấu đơn paid, tạo subscription cho từng học sinh, cập nhật users.school_plan=standard cùng users.school_expires_at, và tạo thông báo.
6. Frontend polling trạng thái đơn mỗi 4 giây. Không gửi hoặc lưu cookie / thông tin ngân hàng của học sinh.

## Chống gian lận và đối soát

- billing_transactions.gateway_transaction_id có unique constraint; webhook lặp không thể kích hoạt hoặc cộng ngày hai lần.
- Chỉ số tiền khớp **chính xác** tổng tiền đơn mới được kích hoạt. Thiếu/thừa tiền được lưu với trạng thái amount_mismatch để Admin đối soát.
- Không có mã đơn, mã không tồn tại, đơn đã hết hạn hoặc đã thanh toán sẽ không kích hoạt quyền.
- Giao dịch đến sau hạn thanh toán được lưu late_payment; xử lý thủ công, không tự động cấp quyền.
- Admin xem số liệu, đơn và giao dịch ngoại lệ qua GET /api/admin/billing/overview.
- Webhook trả {"success":true} sau khi đã lưu bền vững giao dịch kể cả khi cần xử lý ngoại lệ, để SePay không retry vô hạn. Request không xác thực trả 401.

## Gia hạn và nhắc trước 7 ngày

Billing reminder worker chạy mỗi 6 giờ trên web process. Worker xếp hàng một email + notification khi subscription còn không quá 7 ngày; mỗi subscription chỉ có một reminder nhờ unique key. Mail dùng cấu hình SMTP/Resend/Gmail hiện có (MAIL_PROVIDER, SMTP_*, v.v.). Khi chưa cấu hình email, reminder vẫn ở trạng thái queued. Nếu học sinh đã gia hạn và ngày hết hạn hiện tại thay đổi, reminder cũ bị hủy.

Hệ thống tự chuyển subscription quá hạn sang expired và hạ users.school_plan về none. API/frontend School access cũng kiểm tra school_expires_at để không phụ thuộc vào thời điểm worker chạy.

## Migration và deploy

1. Backup PostgreSQL và diễn tập restore theo deployment guide.
2. Chạy npm run db:plan, xác nhận có platform:008_school_standard_billing.sql.
3. Chạy migration theo quy trình production hiện tại, có MAIHOC_BACKUP_VERIFIED=1 chỉ sau restore rehearsal. Không khởi tạo bảng Billing tự động khi server khởi động. Migration `platform:008_school_standard_billing.sql` là nguồn schema chính thức và phải được chạy bằng `npm run db:migrate` sau khi đã backup/restore rehearsal; `server/account-upgrade.js` chỉ bổ sung cột `users.school_expires_at` theo cơ chế nâng cấp tài khoản hiện có.
4. Đặt webhook URL trên SePay, giữ SEPAY_ENABLED=0 trong lần deploy đầu.
5. Kiểm thử một đơn học sinh, một đơn nhà trường nhiều học sinh, webhook sai chữ ký, sai số tiền, webhook trùng, đơn hết hạn và gia hạn.
6. Kiểm tra email nhắc hạn với tài khoản staging; chỉ sau đó bật SEPAY_ENABLED=1 để nhận tiền thật.

## API

- GET /api/billing/plans — giá, thời hạn, trạng thái cấu hình.
- GET /api/billing/options — hình thức mua và trường mà người mua có quyền quản lý.
- GET /api/billing/schools/:schoolId/students — học sinh đủ điều kiện trong trường.
- POST /api/billing/orders — tạo đơn.
- GET /api/billing/orders/:orderCode — xem trạng thái đơn cho người mua/người nhận.
- GET /api/billing/history và GET /api/billing/subscription — lịch sử và quyền cá nhân.
- POST /api/billing/sepay/webhook — nhận giao dịch SePay.
- GET /api/admin/billing/overview — Admin/Super Admin xem doanh thu và giao dịch ngoại lệ.

## Admin cấp School miễn phí

Tại **School → Quản trị → Tài khoản người dùng**, Admin chọn **Add vào gói School** trên dòng học sinh và xác nhận. Hệ thống cấp `school_plan=standard`, `school_expires_at=NULL`, `account_type=school`: School Standard miễn phí, không thời hạn. Không tạo đơn hàng, subscription thanh toán hoặc giao dịch SePay. Giáo viên và Admin đã có School theo vai trò; tài khoản Legacy hoặc Standard không thời hạn không cần cấp lại. Lớp học, bài làm, mật khẩu và lịch sử thanh toán được giữ nguyên; thao tác không tự thêm học sinh vào lớp/trường.

API `POST /api/admin/users/:id/school` dùng `requireSuperAdmin` và kiểm tra same-origin; chỉ Admin hệ thống (bao gồm Admin quản lý đã được ủy quyền), không phải giáo viên hoặc school_admin theo membership. Khóa dòng user và transaction bảo đảm cấp lặp không tạo thêm audit/thông báo. Ghi `audit_logs.action=school_grant` với người cấp, user nhận, trạng thái cũ, quyền mới và `paymentRequired=false`; thông báo trong tài khoản nhận. Lỗi audit hoặc ghi dữ liệu sẽ rollback toàn bộ thao tác.

Người dùng đang đăng nhập nhận quyền mới ở request kế tiếp; tải lại trang để cập nhật giao diện. Trang gói School hiển thị quyền không thời hạn, không yêu cầu mua/gia hạn. Đơn đã mở trước khi Admin cấp vẫn được đối soát khi thanh toán, nhưng webhook không ghi đè quyền không thời hạn bằng thời hạn hữu hạn. Worker không tạo nhắc gia hạn cho tài khoản không thời hạn; nhắc đang chờ bị hủy khi cấp. Không cần migration mới.

Kiểm tra: `node --test server/admin-school-grants.test.js server/billing.test.js tests/admin-users-ui.test.js` và `node scripts/admin-school-grants-check.mjs` (preview PostgreSQL cô lập, không dùng dữ liệu thật).
