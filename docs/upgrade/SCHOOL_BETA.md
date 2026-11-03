# School upgrade beta: thử nghiệm trước khi phát hành

PR này triển khai từ `main` tại `2ea919d4adfbdaa7000c55dc1fc9c12d62f24857`, theo bản thiết kế School ngày 03/11/2026. Đây là bản beta có luồng thật và migration bổ sung; chưa phải bản đã nghiệm thu tải 50 người hoặc chất lượng OCR thực tế.

## Có thể thử những gì?

| Nhóm | Luồng trong bản beta |
|---|---|
| Sidebar | Bốn lối vào School: Thí nghiệm, Phòng học School, Số hóa đề AI, Vở học AI. Cố vấn và Kết quả học tập giữ vị trí cũ. |
| Thí nghiệm | Giữ thư viện 2D. Thêm WebGL 3D: proton trong từ trường đều, ném xiên, đường sức dây dẫn thẳng. Dùng lại SimulationEngine; mô hình tính theo SI; xoay/phóng to, chạy/dừng, ghi số đo, lưu phiên PostgreSQL. |
| Số hóa đề | Tải ảnh/PDF → job PostgreSQL → worker Gemini đa phương thức → bản đọc chỉnh sửa → đối chiếu nguồn → nhập đáp án → ghép theo phần/số câu → xuất PDF đề/đáp án/bộ đầy đủ. |
| Vở | Đọc bản chép → học sinh sửa/xác nhận → phản hồi gợi mở/sửa từng bước/giải chi tiết → PDF phản hồi hoặc chuyển bản chép sang Gia sư AI hiện có. |
| Kho câu hỏi | Giáo viên chuyển đề đã xác nhận vào `question_versions` dạng draft. Duyệt bằng Ngân hàng câu hỏi hiện có. Không tạo kho đề thứ hai. |
| Phòng School | SFU LiveKit thay lớp truyền video cho phòng trả phí, 50 người gồm chủ trì; camera/mic, giơ tay, chat PostgreSQL, chia sẻ màn hình, khóa/mời ra, ghi Egress MP4 vào R2. Phòng Learning 12 người giữ nguyên. |
| AI phòng | API key/model riêng; hỏi riêng, chia sẻ vào chat chung bằng thao tác chủ động. Lưu kết quả riêng để chống gửi trùng. |
| Phụ đạo | Trong Kết quả học tập, chọn lớp/môn → mở câu sai làm bằng chứng → quy tắc đề xuất nhóm → giáo viên duyệt → tạo bài giao cá nhân bằng assessment hiện có, chống duyệt lặp. |
| Quyền/chi phí | Flag tắt mặc định, chỉ trường đăng ký beta đang hiệu lực dùng được. Giới hạn lượt AI/người/trường/ngày, tài liệu 10 MB/20 trang/100 câu, ghi tối đa 30 phút/lần khi worker đang chạy. |

AI cố vấn học sinh/giáo viên hiện có tiếp tục đảm nhiệm lộ trình và đọc dữ liệu backend. Bản beta bổ sung phân tích bằng chứng vào engine cố vấn; không tạo thêm một cố vấn hoặc khôi phục bảng điểm trong panel cố vấn.

## 1. Xem giao diện mà chưa dùng API/DB thật

Từ root repo, dùng Node theo `.node-version`:

```bash
npm ci --ignore-scripts
npm ci --prefix server --ignore-scripts
npm run build
```

Chạy preview cô lập (Linux/macOS; Windows PowerShell dùng `$env:TEN_BIEN='gia_tri'` trước lệnh):

```bash
MAIHOC_SCHOOL_UPGRADE_ENABLED=1 MAIHOC_PREVIEW_PASSWORD=your-local-test-password npm run preview:isolated
```

Mở `http://127.0.0.1:4173`. Tài khoản `student@maihoc.test`, `teacher@maihoc.test`, `admin@maihoc.test` dùng mật khẩu local bạn vừa đặt. Preview tạo PostgreSQL trong bộ nhớ, xóa biến DB production, đăng ký một trường thử nghiệm. Không dùng preview để lưu dữ liệu cần giữ lâu dài.

Khi chưa có key, dùng phần **Nhập nội dung thủ công** trong Số hóa đề/Vở để thử đối chiếu và PDF. Đây là bản nháp do người dùng nhập, không phải OCR giả. Phòng sẽ hiện chưa cấu hình video và khóa nút tạo phòng.

## 2. Thử trên một môi trường staging có PostgreSQL/R2

1. Tạo backup và kiểm chứng restore theo quy trình migration hiện có. Không trỏ preview hoặc test runner vào production.
2. Cài cả dependencies root/server và chạy build. Repo đã kèm dist được xây lại; build lại khi sửa nguồn.
3. Chạy `npm run db:plan` ở root để xem migration. Chạy `npm run db:migrate` sau khi đã xác nhận đủ điều kiện. Production có guard `MAIHOC_BACKUP_VERIFIED=1`; chỉ đặt sau khi đã diễn tập restore. Giữ nguyên các migration cũ, không chạy lại SQLite importer.
4. Bật `MAIHOC_PLATFORM_ENABLED=1` và `MAIHOC_SCHOOL_UPGRADE_ENABLED=1` trên staging.
5. Trường phải có school_memberships, lớp và phân công/ghi danh canonical như nền tảng hiện tại. Nếu đang dùng lớp legacy, làm theo hướng dẫn bootstrap/mapping có sẵn; không tự tạo ID thay thế hoặc đổi ID tài khoản.
6. Trong console SQL của DB staging, tìm đúng trường rồi đăng ký pilot. Đây là thao tác quản trị thủ công trong beta:

```sql
SELECT id, code, name FROM schools WHERE status='active';
-- Thay 123 bằng school_id đã đối chiếu, không dùng ID ví dụ nguyên trạng.
INSERT INTO school_upgrade_access(school_id,enabled,expires_at,daily_ai_calls)
VALUES(123,true,now()+interval '30 days',100)
ON CONFLICT(school_id) DO UPDATE
SET enabled=excluded.enabled,expires_at=excluded.expires_at,daily_ai_calls=excluded.daily_ai_calls;
```

7. Web giữ Root Directory `server`, Start Command **`node server.js`**. Migration không tự chạy khi bật flag. Hãy chạy migration trước khi cho người dùng truy cập beta.

Thu hồi beta của một trường bằng `UPDATE school_upgrade_access SET enabled=false WHERE school_id=...`; không thay đổi gói legacy/standard/premium hoặc dữ liệu School cũ. Pilot là lớp cấp quyền bổ sung, không phải hệ thống thanh toán/gia hạn tự động.

## 3. Cấu hình AI và worker

Trong môi trường backend và worker (giá trị thật chỉ đặt trong secrets/environment):

```dotenv
ROOM_AI_API_KEY=
ROOM_AI_MODEL=
SCHOOL_DOCUMENT_AI_API_KEY=
SCHOOL_DOCUMENT_AI_MODEL=
```

Chọn model có khả năng ảnh/PDF từ project đang sử dụng. Cả hai scope beta dùng adapter Gemini hiện tại. Key/model phải cấu hình riêng; **không fallback** sang GEMINI_API_KEY, LEARNING_ADVISOR_API_KEY hoặc GEMINI_SOLUTION_API_KEY. Một key khác trong cùng project vẫn có thể dùng chung quota nhà cung cấp.

Giữ cấu hình advisor/shared/exam hiện có cho cố vấn và gia sư. `npm run ai:check -- --live` và `--generate` kiểm tra thêm room/document khi flag beta bật, không in key. Chỉ chạy `--generate` khi muốn thực hiện lệnh gọi thật có thể tiêu hao quota.

Chạy một tiến trình worker riêng từ root:

```bash
npm run school:worker
```

Hoặc từ Root Directory `server`, lệnh cũng là `npm run school:worker`. Worker cần cùng PostgreSQL, R2, flag và key tài liệu. Web vẫn dùng `node server.js`. Không thay start command web bằng worker. Render free web không tự cung cấp background worker; dùng worker local nối DB staging hoặc một worker riêng có cấu hình phù hợp.

Job tài liệu được claim bằng khóa PostgreSQL và lease; restart có thể tiếp tục queued/stale-running. Provider có timeout 45 giây; một ảnh/PDF/job, worker xử lý tuần tự. Job lỗi được giữ với thông báo an toàn; tải lại tệp để thử lại. Lượt thử được tính vào hạn mức ngày UTC, kể cả provider lỗi; beta chưa có kế toán token/billing hoàn chỉnh.

Worker định kỳ kiểm tra lại quyền thành viên trên SFU, đồng thời cập nhật tình trạng ghi, yêu cầu dừng sau 30 phút, xóa MP4 hết 30 ngày và xử lý hàng đợi xóa tệp khi tài khoản/tài liệu/phòng bị xóa. Cần giữ worker hoạt động; nên cấu hình thêm lifecycle rule R2 cho prefix recordings 30 ngày. Không dùng prefix tệp tài liệu cho lifecycle 30 ngày nếu muốn giữ bản gốc lâu hơn.

## 4. Cấu hình SFU và MP4

```dotenv
LIVEKIT_URL=wss://your-livekit-service
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
MAIHOC_SCHOOL_RECORDING_ENABLED=1
```

Sử dụng managed LiveKit hoặc SFU/Egress tự host riêng. Backend kiểm tra quyền trường/lớp, token TTL 60 giây, 50 ghế con người được giữ bằng transaction và đối chiếu participant SFU; SFU có thêm chỗ cho bot ghi hình. Không tăng hằng số 12 của phòng Learning lên 50.

MP4 sử dụng LiveKit Egress và thông số R2 hiện hữu (`R2_BUCKET_NAME`, access/secret, endpoint/account). R2 phải private. Tài khoản SFU phải có Egress và hỗ trợ đích S3-compatible được cấu hình; cần kiểm tra upload thật tới R2 trước khi mở tính năng ghi cho trường. Beta chưa sử dụng webhook: UI và worker kiểm tra Egress theo polling.

Chủ trì bắt đầu/dừng ghi hình. Người tham gia phải xác nhận phòng có thể ghi camera/âm thanh/màn hình; không có chế độ ghi bí mật. Chat AI riêng không nằm trong bố cục Egress. Bản ghi cho người đã tham gia và còn quyền trong trường; hết hạn sẽ không tải được. Đóng phòng không chặn tải bản ghi hợp lệ của thành viên cũ.

Chia sẻ màn hình phụ thuộc HTTPS và khả năng trình duyệt; không hứa điện thoại nào cũng có thể tự chia sẻ hay có âm thanh hệ thống. Một người trình bày tại một thời điểm; server kiểm soát quyền publish screen. Video tải tối đa sáu camera cộng màn hình để giảm tải client; đây không phải cấu hình nhận 49 video cùng lúc.

## 5. Điều cần kiểm thử với tài khoản/dịch vụ thật

- Nhận diện tài liệu: chữ viết tay tiếng Việt, công thức, đề nhiều phần trùng số câu, trang nghiêng/mờ, hình/bảng, PDF scan. Mở bản gốc để đối chiếu, không tin mức tự đánh giá của AI là xác suất hiệu chuẩn.
- Ghép đáp án: phần/số câu không khớp, thiếu, thừa, trùng. Bản ghép trở lại needs_review. Xác nhận sau khi sửa mới xuất bộ đầy đủ; thiếu đáp án chặn xuất bộ hoàn chỉnh. Câu trắc nghiệm vào kho dùng A/B/... hoặc index từ 0; câu không có lựa chọn vào kho dạng essay để giáo viên duyệt rubric.
- PDF hiện xuất công thức theo nội dung văn bản/LaTeX đã chép; chưa có bộ dàn trang công thức và tái dựng hình minh họa chất lượng in ấn. Ảnh/PDF nguồn vẫn mở riêng. Đây là hạn chế beta cần nghiệm thu trước khi dùng để in đề chính thức.
- Chất lượng OCR/feedback/AI: chưa gọi provider thật trong kiểm thử tự động. Test worker dùng provider giả lập có kiểm soát; luồng browser nhập nội dung thủ công. Không công bố tỷ lệ nhận diện hoặc tốc độ khi chưa đo.
- Họp: tạo phòng hai tài khoản trước, thử bật/tắt mic/camera, screen share, mất mạng/reconnect, khóa/mời ra, recording và tải MP4 thực. Sau đó mới chạy thử đủ 50 người; người thứ 51 bị chặn. Kiểm thử dịch vụ thực gồm độ trễ, packet loss, CPU/RAM và dung lượng/băng thông. Chưa có kết quả thử 50 người thực trong PR.
- Phụ đạo: cần ít nhất 5 câu độc lập qua ít nhất hai lượt đánh giá cho một học sinh/chuyên đề mới có đề xuất. Giáo viên chọn đúng lớp/môn và duyệt trước khi giao. Đề xuất nhóm dùng quy tắc dữ liệu backend (sai >=40%), không gửi tên và toàn bộ kết quả lớp cho LLM. Có thể chọn lại bằng chứng và tạo đề xuất khác; beta chưa có màn hình chỉnh từng thành viên/rubric trong bản nháp hoặc báo cáo so sánh can thiệp trước/sau chuyên biệt. Kết quả bài bổ trợ xem trong hệ thống bài được giao hiện hữu.
- Các scope AI mới chặn khi người dùng có phiên thi đang diễn ra. Bản hỗ trợ riêng không được dùng để lấy đáp án kỳ thi.

## 6. Kiểm thử tự động và quay lui

```bash
npm run test:school-upgrade
npm run test:school-upgrade:browser
npm test
npm run test:platform
npm run build
npm run check:dist
```

`test:school-upgrade:browser` dùng PGlite độc lập, Chromium, ba viewport 1440x1000 / 1024x900 / 390x844; kiểm tra xem/sửa tài liệu, PDF, vở, trạng thái thiếu dịch vụ, WebGL, lưu thí nghiệm, bằng chứng và tràn ngang. Đây là giả lập viewport, không thay thế kiểm thử camera/mic/chia sẻ màn hình trên thiết bị thật hoặc Safari/Firefox.

Khi cần quay lui: đặt `MAIHOC_SCHOOL_UPGRADE_ENABLED=0`, tắt ghi, dừng worker sau khi xử lý xong tác vụ đang chạy; không drop bảng hoặc xóa migration đã ghi checksum. Dữ liệu và module Learning/School hiện tại không bị chuyển đổi. Không merge lên production chỉ để thử video/OCR khi chưa có staging và ngân sách dịch vụ.

Tài liệu thiết kế gốc được lưu ở `docs/upgrade/SCHOOL_UPGRADE_DESIGN.md`. Bảng trên mô tả đúng phần đã triển khai; các mục hạn chế không được coi là chức năng đã hoàn tất.

## Kết quả kiểm tra trong phiên tạo PR

- 14 kiểm thử beta (PostgreSQL trong bộ nhớ): quyền/CSRF/pilot expiry, tệp riêng tư, stale revision, ghép đáp án, PDF, worker, mô hình vật lí, 50 ghế, bằng chứng và duyệt/giao idempotent, xuất câu nháp, active exam, SFU/Egress giả lập.
- 28 kiểm thử root; 23 kiểm thử platform; 40 kiểm thử backend hiện có: đạt.
- Browser beta: desktop/tablet/mobile đạt; kiểm tra hồi quy School access, auth, Learning, advisor và browser hiện có đạt. Provider AI và SFU/Egress thật chưa được gọi trong các kiểm tra này.
- Build và check:dist đạt; migration cũ giữ nguyên checksum, schema mới được kiểm tra chạy lặp thông qua suite platform.
- Chưa kiểm thử đủ 50 người thực, ảnh viết tay thật qua Gemini, upload MP4 thật vào R2, Safari/Firefox hoặc thiết bị iOS/Android thật. Những việc này là điều kiện nghiệm thu staging, không được suy ra từ test giả lập.
