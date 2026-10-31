# Kiểm chứng bản nâng cấp

## Các kiểm tra có thể tái lập

```bash
npm ci --ignore-scripts
npm ci --prefix server --ignore-scripts
npm test
node --test server/tests/platform-foundation.test.js server/tests/postgres-runtime.test.js
npm run test:platform
npm run build
npm run check:dist
npx playwright install --with-deps chromium
npm run test:browser
```

`test:platform` mặc định chạy trên PGlite, engine PostgreSQL nhúng, không dùng dữ liệu thật. Test gồm migration/checksum, FK tổng hợp, cô lập hai trường cùng mã lớp, CSRF/auth, chuyển lớp và import nguyên khối, duyệt/version/snapshot câu hỏi, resume/deadline/version/idempotency, chấm phân số và đúng/sai lũy tiến, quyền sửa điểm/audit, bài luyện cá nhân, job AI ownership, metadata/timer phòng và projection roster hai chiều.

Workflow `school-learning.yml` cấu hình PostgreSQL 16 riêng trong GitHub Actions và chạy cùng suite với `MAIHOC_TEST_DATABASE_URL`. Tên database phải có `test` và schema phải trống. Không dùng URL production. Kết quả CI cần được đọc sau khi PR được push; cấu hình workflow chưa đồng nghĩa CI đã xanh.

`test:browser` tự khởi động Express thật trong cùng tiến trình kiểm thử, dùng PostgreSQL nhúng và dữ liệu giả. Nó không đọc DATABASE_URL production. Các kiểm tra dùng cookie/session thật, API thật, source protection, deep link, dashboard desktop/mobile, menu, teacher portal và submit/retry/result của tests cũ. Luồng UI mới còn kiểm tra giáo viên tạo chuyên đề/câu hỏi, duyệt và giao bài; học sinh tải lại để khôi phục nháp, nộp bài, xem tiến trình rồi mở bài luyện bổ sung. Third-party font/MathJax tải từ CDN bị chặn trong test để không phụ thuộc dịch vụ ngoài.

Ảnh và báo cáo trình duyệt được ghi vào `test-results/`, không commit tự động. CI tải chúng lên artifact `maihoc-browser-verification`.

## Chưa được chứng minh bằng các kiểm tra trên

- Kết nối PostgreSQL/Render production, cấu hình TLS/pool và thời gian lock trên dữ liệu lớn.
- R2 bucket thật, file lịch sử, Range requests/PDF scan hoặc CDN cache thực tế.
- Gemini model/quota/API key thật, độ chính xác nội dung AI và SMTP thực tế.
- Camera/microphone/TURN trên nhiều thiết bị; phục hồi WebRTC sau restart; nhiều backend instance.
- Tải đồng thời toàn trường, backup/restore theo RPO/RTO và nghiệm thu của giáo viên.
- Các công cụ import/cleanup SQLite cũ cần native addon riêng; suite mới không thay thế các kiểm tra đó.

Đây là các cổng staging/pilot trước khi phát hành, không phải lý do để bỏ qua hoặc giả định đã đạt.
