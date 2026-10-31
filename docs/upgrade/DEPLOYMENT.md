# Triển khai và khôi phục

## Chuẩn bị

1. Ghi lại commit hiện tại, schema, số bản ghi, sequence, FK/index và object key R2. Dùng database staging độc lập; không trỏ PR preview vào production.
2. Tạo backup PostgreSQL và diễn tập restore trên staging. Đối soát tài khoản, sessions, documents, tests, submissions, answer keys và learning_results. R2 không nằm trong backup database; kiểm kê riêng.
3. Cài dependencies từ lockfile. Build frontend ở root bằng `npm ci --ignore-scripts && npm run build`. Backend tiếp tục chạy `npm start` trong `server/` theo cấu hình Render hiện tại.
4. Kiểm tra `DATABASE_URL`, R2, SMTP, `PUBLIC_ORIGIN`, `BACKEND_ORIGIN`, đường `/api`, `/socket.io`, `/vendor` và cookie. Không tạo database School/Learning riêng.
5. Đặt `GEMINI_MODEL` thành tên model đã kiểm chứng bằng tài khoản API triển khai; `GEMINI_SOLUTION_MODEL` có thể chọn model riêng cho giải đề. `GEMINI_FALLBACK_MODELS` là danh sách cấu hình phân cách dấu phẩy. Không dùng chuỗi tên phỏng đoán. Phiên bản này báo lỗi cấu hình nếu thiếu model; cần hoàn tất bước này trước khi triển khai code có AI.

## Migration

- `npm run db:plan`: chỉ liệt kê migration và checksum, không ghi database.
- Sau khi schema nền và School runtime cũ đã tồn tại, chạy `npm run db:migrate` trên staging.
- Production yêu cầu thêm `MAIHOC_BACKUP_VERIFIED=1` sau khi đã thực sự diễn tập restore. Biến này là xác nhận vận hành, không tự tạo backup.
- Migration chạy transaction với advisory lock và ledger `app_migrations`. Checksum thay đổi sẽ dừng; không sửa file đã áp dụng. Dùng migration tiếp theo để forward-fix.
- Chạy migration trong bước pre-deploy/maintenance có quyền kết nối đúng database, trước khi start app mới. Không chạy backfill dài trong build frontend hoặc mỗi lần restart.

## Bootstrap trường đang dùng

Bootstrap là thao tác riêng, mặc định preview:

```bash
LEGACY_SCHOOL_CODE=... LEGACY_SCHOOL_NAME=... \
LEGACY_YEAR_CODE=... LEGACY_YEAR_START=... LEGACY_YEAR_END=... \
LEGACY_ADMIN_ID=... npm run db:bootstrap
```

Sau khi kiểm tra đầy đủ mapping và các ngoại lệ, dùng `node server/platform/bootstrap.js --apply` với cùng cấu hình. Không tự gán năm học chỉ từ tên lớp. Bootstrap chỉ map roster hiện tại; không gán năm/chuyên đề giả cho bài làm lịch sử.

- Một user có nhiều legacy class membership sẽ làm bootstrap dừng để xử lý ngoại lệ.
- Bootstrap giữ bảng membership/teacher assignments/join locks cũ; thêm trường/năm/lớp, membership và enrollment mới.
- `legacy_class_mappings` cố định namespace của trường/năm cũ. Trigger projection cập nhật membership và enrollment trong cùng transaction, tránh ghi lệch khi UI cũ hoặc mới thay đổi roster.
- Projection từ legacy dùng actor kỹ thuật `legacy_sync_actor_id`, có reason ghi rõ nguồn. Người duyệt thực tế vẫn nằm trong request record legacy. Không được hiểu actor kỹ thuật là người đã duyệt yêu cầu.
- Trường hoặc năm mới không được ghi chung `class_code` legacy. Người học có enrollment không map được được hướng sang School mới; không chọn nhầm lớp cùng mã ở trường khác.
- Phân công giáo viên được bootstrap một lần. Cần đối soát phân công cũ/mới khi quản trị thay đổi quyền trong giai đoạn chuyển tiếp; chưa có projection hai chiều cho mọi thay đổi teacher assignment.

## Bật theo từng thành phần

| Biến | Mặc định | Tác dụng |
| --- | --- | --- |
| `MAIHOC_PLATFORM_ENABLED` | tắt | API School mới, phiên server của tests cũ và guard AI theo phiên kiểm tra |
| `MAIHOC_AI_WORKER_ENABLED` | tắt | Cho phép enqueue/poll AI Tutor văn bản; cần worker thực sự đang chạy |
| `MAIHOC_PERSIST_STUDY_ROOMS` | tắt | Metadata/password hash/timer phòng trong PostgreSQL; chỉ bật sau migration |
| `MAIHOC_R2_ONLY` | tắt | Giảm ghi local/BYTEA ở upload tài liệu chung; giữ đọc fallback cũ |
| `MAIHOC_RUN_LEGACY_STARTUP_MIGRATIONS` | tắt | Chế độ tương thích tạm thời cho maintenance cũ lúc startup |
| `MAIHOC_REBUILD_RESULTS_ON_EXPORT` | tắt | Tương thích tạm thời với sync toàn bảng khi export |

Khởi động worker riêng bằng `npm run jobs:worker` ở root, cùng `DATABASE_URL` và cấu hình Gemini. Worker thực hiện tuần tự, lease có heartbeat, retry có giới hạn. Đây là cơ chế xử lý có thể lặp; không cam kết mọi lời gọi provider chỉ xảy ra một lần. Nếu mất lease, worker cũ không được ghi đè kết quả worker mới.

Chạy `npm run db:legacy` để xem phạm vi maintenance; `node scripts/legacy-maintenance.mjs --apply` chỉ khi đã sao lưu/kiểm tra staging. Đặt rõ hai cờ tương thích startup/export nếu một deployment cũ còn cần hành vi đó trước khi hoàn tất reconciliation.

## R2

Không đổi bucket/key hoặc xóa dữ liệu cũ trong đợt này. `npm run storage:verify` tạo báo cáo chỉ đọc bằng HEAD object cho các tham chiếu DB (mặc định 100; `MAIHOC_STORAGE_VERIFY_LIMIT` tối đa 10000). Báo cáo ghi rõ số còn chưa kiểm tra; kiểm tra một mẫu không chứng minh toàn kho an toàn. File answer key và bài chờ duyệt cần được kiểm tra riêng trong rehearsal nếu không nằm trong nhóm truy vấn của công cụ.

Chỉ bật R2-only sau khi upload/read/download qua API, reader PDF và file cũ đã thành công. Khi upload object thành công nhưng DB thất bại, tiếp tục dùng cleanup hiện có; chưa bật job tự động xóa object nghi mồ côi.

## Nghiệm thu và rollback

Trước cutover kiểm tra: session cũ, đăng ký/login/logout/reset password, lớp/roster, upload/download tài liệu và answer key, submit/retry/đóng hạn, immediate/deferred/regrade, XLSX/CSV, AI, Socket.IO và phòng học. Đối soát row counts, mapping và điểm; kiểm tra hai trường có cùng class_code.

Nếu chưa có dữ liệu native mới, có thể tắt feature flags và rollback code tương thích. Sau khi đã phát sinh enrollment, assignment và attempt mới, không rollback tùy tiện về code không hiểu dữ liệu đó. Giữ code tương thích, tắt luồng phát hành mới và forward-fix; xác minh legacy roster projection còn nguyên. Không drop bảng/cột mới hoặc khôi phục toàn database để xử lý lỗi giao diện.

Theo dõi 5xx, thời gian truy vấn, DB pool, lỗi submit, mismatch projection, job backlog/lease, R2 và quota AI. RPO/RTO, chính sách lưu dữ liệu và khả năng Render không được giả định từ PR này; phải xác nhận bằng môi trường triển khai.
