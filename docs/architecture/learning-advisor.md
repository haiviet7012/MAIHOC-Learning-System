# Cố vấn học tập AI

Tích hợp vào Tiến trình học tập Learning và Kết quả học tập School. Ba lựa chọn: thiết kế lộ trình, đánh giá lộ trình đang áp dụng và biểu đồ tiến bộ. Hội thoại tự do vẫn giới hạn học tập; hội thoại/lộ trình tách theo người dùng và trường.

## Cấu hình local

Tạo một API key riêng tại https://aistudio.google.com/api-keys. Muốn tách quota/billing, tạo key trong Google Cloud project riêng; hai key trong cùng project có thể dùng chung quota.

Mở `server/.env` đang có và thêm (không ghi đè các biến khác):

```env
MAIHOC_LEARNING_ADVISOR_ENABLED=0
LEARNING_ADVISOR_API_KEY=YOUR_DEDICATED_KEY
LEARNING_ADVISOR_MODEL=gemini-3.6-flash
```

Đây là một API key và hai biến cấu hình, không phải ba API key. Engine không đọc `GEMINI_API_KEY`, không dùng fallback model/client của solver. Key chỉ được đọc ở server và gửi trong header, không ở URL hoặc frontend. Không commit `.env`, không gửi key qua chat. File mẫu: `server/.env.learning-advisor.example`.

Từ thư mục gốc repository:

```sh
npm ci --ignore-scripts
npm ci --prefix server --ignore-scripts
npm run db:plan
npm run db:migrate
npm run build
```

Migration dùng kết nối PostgreSQL đã cấu hình của dự án, không chạy importer SQLite. Migration runner hiện tại yêu cầu `MAIHOC_BACKUP_VERIFIED=1` trên production sau khi đã diễn tập phục hồi backup. Giữ nguyên các migration cũ; `006_learning_advisor.sql` là migration bổ sung. Sau khi migration thành công, đổi `MAIHOC_LEARNING_ADVISOR_ENABLED=1` rồi khởi động lại backend (`npm start --prefix server` nếu chạy từ gốc).

Không cần `MAIHOC_AI_WORKER_ENABLED`: cố vấn dùng API request riêng. Tab School tiếp tục cần cấu hình nền tảng School hiện tại và membership học sinh. Learning không phụ thuộc việc bật giao diện School, nhưng migration nền tảng cần được áp dụng.

## Render

1. Merge PR sau khi review. Deploy code có tính năng nhưng để `MAIHOC_LEARNING_ADVISOR_ENABLED=0`.
2. Chọn đúng Web Service backend → Environment → thêm ba biến trên. Không thay thế `GEMINI_API_KEY` hoặc `DATABASE_URL`.
3. Chạy migration bằng release/pre-deploy job hoặc Shell theo lệnh của repository. Nếu Root Directory của service là `server`, dùng `npm --prefix .. run db:plan` và `npm --prefix .. run db:migrate`; từ repo root dùng lệnh như phần local. Đáp ứng yêu cầu backup của runner trước khi chạy production.
4. Bật flag bằng `1`, chọn Save, rebuild, and deploy. Build phải chạy `npm run build` ở repo root vì server ưu tiên phục vụ `dist` khi có manifest.
5. Đăng nhập học sinh → Learning → Tiến trình học tập; School → Kết quả học tập. Kiểm tra biểu đồ, gửi yêu cầu, áp dụng kế hoạch, đánh dấu nhiệm vụ, tải lại và đánh giá.

Nếu chưa chạy migration, cố vấn trả thông báo 503 riêng. Nếu key/model sai hoặc hết quota, biểu đồ và kế hoạch đã lưu vẫn xem được. Tắt flag để rollback tính năng, không drop bảng và không rollback dữ liệu học tập.

## Dữ liệu và chỉ số

- Learning: lịch sử `exam_attempts` có `graded=1` và loại exam/practice; tiến trình hiện tại từ `user_progress`. Không dùng score do trình duyệt ghi vào progress làm căn cứ điểm đã chấm.
- School: kết quả đã chấm từ `assessment_*`; kết quả legacy `test_submissions` chỉ nối vào trường qua `tests.class_code` và `legacy_class_mappings`. Không tự đoán trường/năm học cho dữ liệu cũ chưa ánh xạ.
- `learning_results` là bảng projection của các nguồn cũ, không cộng lần nữa để tránh đếm trùng. Các lượt làm lại khác nhau vẫn là các quan sát riêng, chỉ số là trung bình các lượt làm bài, không phải điểm tổng kết chính thức.
- Điểm chuẩn hóa: `100 * score / scale`; trung bình không trọng số trên các lượt đã chấm. Loại điểm null, scale không hợp lệ và điểm ngoài thang. Không tự suy ra GPA/thang 4.0.
- School: đồ thị đường đỏ có vùng tô theo ngày trên thang 10 chuẩn hóa và radar xanh theo môn. Learning: radar xanh. Cả hai có bảng điểm ngày; chọn ngày trên radar để so với ngày có dữ liệu liền trước (nét đứt, chỉ khi đủ cùng các trục).
- Ngày tính theo Asia/Ho_Chi_Minh. Ngày không có điểm không biến thành 0. Tối thiểu 3 môn để vẽ radar; bảng vẫn hiển thị nếu dữ liệu ít. Radar tối đa 8 môn để dễ đọc; bảng hiển thị toàn bộ môn.
- Khoảng lọc 7/30/90 ngày (cửa sổ lùi theo thời điểm truy vấn). Tối đa 2.000 kết quả mỗi nguồn, 5.000 sự kiện và 200 mục progress để giới hạn payload; UI công bố giới hạn. Với khối lượng lớn hơn cần aggregation/pagination tiếp theo.
- Trigger ghi thay đổi progress/status trong cùng transaction với `user_progress`. Không tạo lại lịch sử phần trăm ngày trước khi triển khai; lịch sử điểm từ attempts có thể dùng ngay. Sự kiện không phải thời gian học và không chứng minh khả năng thành thạo.

## Lộ trình và hội thoại

Mục tiêu (kể cả hạn cần đạt) do học sinh nhập; thời gian 10–240 phút/ngày. AI trả JSON, server kiểm tra schema, giới hạn 28 ngày/84 nhiệm vụ và tổng phút mỗi ngày. Các nhiệm vụ gồm ngày tương đối, môn, hoạt động và tiêu chí hoàn thành. Ngày 1 là ngày áp dụng; bản đề xuất chưa tự thay thế kế hoạch. Không tạo link học liệu khi chưa có tài nguyên được xác minh.

Lưu các phiên bản và thời điểm áp dụng. Hiển thị bản đề xuất mới nhất và kế hoạch áp dụng gần nhất. Đánh dấu nhiệm vụ là tự xác nhận, không sửa điểm. Đánh giá lấy kế hoạch đã áp dụng cùng dữ liệu mới, trả nhận xét; muốn kế hoạch khác phải chuyển sang Thiết kế và áp dụng bản mới. Lưu 20 tin gần nhất để hiển thị và lấy 12 tin làm ngữ cảnh. Không dùng hệ thống chat người-người cho AI.

API cùng origin, bắt buộc xác thực, quyền sở hữu, phạm vi School/Learning và membership học sinh ở trường. Không có tham số đổi user đích. Mỗi lần đọc/ghi lại kiểm tra quyền, không tin ID lộ trình từ frontend. Chặn tạo và chat AI khi đang có bài kiểm tra thực sự còn hạn; học sinh vẫn xem biểu đồ/plan. Giới hạn theo PostgreSQL: 20 lượt/giờ, 100 lượt/ngày, kể cả các lần gọi thất bại; không phụ thuộc bộ nhớ process. Thời gian gọi provider tối đa 45 giây, không tự retry làm tăng chi phí.

System instruction kiểm soát chủ đề, chỉ dẫn bỏ quy tắc trong lịch sử được xem là dữ liệu; model trả `inScope`, server thay câu trả lời ngoài phạm vi bằng lời nhắc cố định và bỏ tasks. Đây là kiểm soát dựa vào model, không bảo đảm tuyệt đối trước prompt injection; cần red-team thêm trước khi mở rộng. Không cấp tool SQL, web hay quyền sửa điểm cho model. Dữ liệu gửi Google chỉ gồm số liệu/ngữ cảnh học tập của chính người dùng, không gửi email, mật khẩu hay đáp án chuẩn. UI escape toàn bộ nội dung AI; không render HTML của model.

## Kiểm thử và giới hạn

`node --test server/platform/learning-advisor.test.js` kiểm tra số liệu, ngày Việt Nam, key riêng, schema, migration/trigger thực trên PGlite, auth/origin/ownership, tách phạm vi và người dùng, lưu/áp dụng/đánh dấu kế hoạch, ngoài chủ đề, chặn bài kiểm tra và giới hạn request. Suite cố vấn dùng PGlite độc lập để không tranh database với bộ integration School/Learning của CI. Bộ integration hiện có vẫn chạy migration mới trên PostgreSQL thật khi CI cung cấp MAIHOC_TEST_DATABASE_URL.

`npm run test:advisor` chạy ứng dụng đầy đủ, đăng nhập thật, database PGlite, dữ liệu biểu đồ giả lập và chỉ giả lập phản hồi Google; kiểm tra cả lộ trình lưu qua reload, School/Learning, radar so sánh ngày, biểu đồ đường và bố cục mobile. Các ảnh trong test-results là dữ liệu kiểm thử, không phải kết quả học sinh thật.

Chưa thể xác minh quyền truy cập model/quota với tài khoản Google triển khai nếu chưa có key riêng. Không commit key và không dùng key của engine khác để thử. Các nhận xét AI cần được học sinh/giáo viên xem xét; không tự ghi kết luận chính thức vào sổ điểm.

Tài liệu provider: https://ai.google.dev/api/generate-content ; https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash ; https://render.com/docs/configure-environment-variables .
