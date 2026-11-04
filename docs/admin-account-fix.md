# Sửa quản trị tài khoản MAIHOC

Bản sửa dựa trên commit `b9f8bcad05f619334afab678262c325b2f37addf` của repo haiviet7012/MAIHOC-Learning-System. Chưa push GitHub hoặc triển khai lên website.

## Các thay đổi

- Xóa tài khoản: thực thi transaction bằng `db.transaction(...)()`; trước đây thiếu `()` nên transaction không chạy và `result.changes` không tồn tại, dẫn đến thông báo sai “Tài khoản không còn tồn tại”.
- Sau khi xóa thành công, bỏ dòng vừa xóa và tải lại danh sách/tổng số từ server. Nếu nhận 404 vì danh sách cũ, vẫn tải lại danh sách. Kết quả GET cũ không được ghi đè GET mới.
- Chỉ chủ sở hữu có email khớp `ADMIN_EMAIL`, role `admin`, admin_level >= 2 và is_manager=false được xóa người khác. Chủ sở hữu được xóa quản lý, không được tự xóa.
- Quản lý được thêm quản lý khác và giám sát phòng học, cùng các quyền quản trị hiện có. API xóa/duyệt xóa vẫn kiểm tra quyền ở backend.
- `users.role` và `admin_level` là nguồn xác định vai trò: user = học sinh; admin cấp 1 = giáo viên; admin cấp 2 trở lên = quản trị. Đây là cách biểu diễn tương thích của repo, không phải hai vai trò trên cùng tài khoản.
- API không còn trả lớp học sinh cho giáo viên hoặc lớp chủ nhiệm cho quản trị. Khi nâng lên quản lý, gỡ phân công dạy, kết thúc ghi danh học sinh đang hoạt động và đồng bộ vai trò thành viên trường.
- Quyền quản trị trong phạm vi một trường của giáo viên (`school_memberships.role=school_admin`) được giữ nguyên; đây là quyền trên trường, không cấp vai trò học sinh hoặc quyền quản trị toàn hệ thống.
- Database kiểm tra vai trò khi ghi thành viên lớp, phân công giáo viên, thành viên trường, ghi danh đang hoạt động và phân công môn. Ghi trực tiếp SQL và ghi đồng thời cũng phải qua kiểm tra.

## Hai migration bắt buộc

- `009_account_deletion.sql`: gỡ dữ liệu cá nhân liên quan khi xóa tài khoản; giữ tài liệu/đề chung, đơn hàng và nhật ký kiểm toán bằng cách đặt tham chiếu người dùng thành NULL. Xử lý các khóa ngoại trước đây có thể chặn xóa.
- `010_exclusive_account_roles.sql`: sửa phân công mâu thuẫn dựa trên vai trò trong `users`, rồi thêm trigger bảo đảm nhất quán. Không đổi ID, email, mật khẩu. Các ghi danh cũ không còn phù hợp được kết thúc; phân công dạy không phù hợp được gỡ.

## Áp dụng

Giải nén gói vào một thư mục riêng. `files/` chứa các tệp cập nhật theo đúng đường dẫn repo, `removed-files.txt` liệt kê tệp build cũ được thay thế. Ưu tiên áp dụng patch để xử lý cả tệp thêm và xóa:

```bash
# Chạy trong thư mục repo. Thay đường dẫn patch bằng vị trí vừa giải nén.
git apply --check /path/to/maihoc-admin-fix.patch
git apply /path/to/maihoc-admin-fix.patch
npm ci
npm --prefix server ci
```

Nếu `git apply --check` báo xung đột, đối chiếu thay đổi của repo mới với patch; không ép ghi đè công việc hiện có.

Trong môi trường backend, giữ cấu hình ADMIN_EMAIL/ADMIN_PASSWORD hiện có. ADMIN_EMAIL phải là email chính xác tài khoản super của bạn. Không đưa giá trị bí mật vào Git.

Sao lưu và kiểm chứng khôi phục database theo quy trình migration hiện có của repo. Sau đó, trong môi trường có DATABASE_URL đúng:

```bash
MAIHOC_BACKUP_VERIFIED=1 npm run db:migrate
npm run build
npm run check:dist
```

Deploy backend và thư mục `dist/` vừa build, rồi khởi động lại backend. Chỉ sửa `js/app.js` mà vẫn phục vụ `dist/` cũ sẽ không cập nhật giao diện. Gói đã chứa bản build đồng bộ; quá trình build cũng đồng bộ các bản sao dist vốn bị cũ so với source ở commit gốc.

Migration cần thực hiện trước khi mở lại traffic ghi dữ liệu. Việc hoàn tác dữ liệu phân công đã được dọn cần dựa trên bản sao lưu; chỉ quay lại code cũ không khôi phục các phân công đó.

## Kiểm tra đã thực hiện

- `npm test`: 30 test đạt, bao gồm hai test giao diện admin dùng logic thật với DOM/fetch mô phỏng (không phải kiểm thử trình duyệt).
- Các test PostgreSQL/API/auth/mail/platform/timetable trong server: 35 test đạt. Hai test admin mới được chạy lại sau khi bổ sung tình huống ghi danh học sinh và giữ đề chung của quản lý bị xóa: đều đạt.
- `npm run test:platform`: 24 test đạt.
- `npm run test:school-upgrade`: 14 test đạt.
- `npm run test:billing`: 3 test đạt, bao gồm mua theo trường với quyền quản trị trong phạm vi trường.
- Build và kiểm tra source/dist/manifest: đạt. Kiểm tra cú pháp JavaScript và `git diff --check`: đạt.
- Bộ server đầy đủ ban đầu gặp 7 test SQLite cũ không chạy được do thiếu native binding better-sqlite3 trong môi trường Node hiện tại; không thay đổi dependencies để né lỗi. Một fixture cũ cố gán giáo viên vào danh sách học sinh đã được sửa thành kiểm tra thao tác đó phải bị từ chối, giữ nguyên kiểm tra lọc người nhận thông báo.
- Không truy cập database production, không xóa tài khoản thật, không triển khai website.

Test mới: `server/tests/admin-accounts.test.js` và `tests/admin-users-ui.test.js`.
