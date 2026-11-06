# Ngân hàng câu hỏi · MAIHOC School

Mở `/school/question-bank` hoặc chọn **Ngân hàng câu hỏi** trong sidebar School. Phân hệ dùng nguyên sidebar, topbar, tài khoản, nút đổi giao diện và kiểm tra quyền truy cập School hiện có. Nó không phụ thuộc `MAIHOC_PLATFORM_ENABLED` để hiển thị dữ liệu mẫu.

## Thành phần

- [Giao diện và lifecycle](../js/platform/question-bank.js): bộ lọc, tab, editor, preview, giỏ đề, ma trận, biến thể, paywall, import và xuất đề; trả về hàm cleanup khi chuyển route.
- [Model và repository](../js/platform/question-bank-model.js): taxonomy, seed, validation, tìm kiếm không dấu, kiểm tra tồn kho, rút câu và trộn mã đề.
- [Hiển thị công thức](../js/platform/question-bank-math.js): KaTeX cục bộ xuất MathML native, hỗ trợ `$…$`, `$$…$$`, `\(…\)`, `\[…\]`; không phụ thuộc CDN hay font tải ngoài. Chế độ `trust: false`, nội dung giáo viên vẫn được escape trước khi render.
- [CSS riêng](../css/question-bank.css): theme sáng/tối, card 16px, responsive và reduced motion; chỉ áp dụng cho phân hệ.
- [Portal](../js/platform/portal.js): mount phân hệ trước bước kiểm tra nền tảng mới.
- [Kiểm tra & Luyện thi](../js/tests/index.js): nhận bản nháp, cho phép quay lại xem, tải JSON hoặc xóa bản nháp.

## Dữ liệu và trạng thái

Có 8 câu chuẩn thuộc Toán, Vật lý, Tiếng Anh/IELTS và đủ 4 dạng câu: 6 trong Kho Nhà trường, 2 trong Kho Pro. Hai câu mẫu thuộc kho cá nhân của tài khoản hiện tại. Thêm 8 bản nháp để kiểm thử luồng duyệt; tab duyệt chỉ hiện cho giáo viên/quản trị viên. KPI tính từ dữ liệu thực trong bản trải nghiệm, không dùng tổng số giả hàng nghìn câu.

Mỗi tài khoản có kho riêng trên trình duyệt tại `maihoc:question-bank:v1:<userId>`. Lưu thất bại vẫn giữ thay đổi trong phiên và thông báo rõ. Thêm/sửa tạo bản nháp cần duyệt; câu sửa được loại khỏi giỏ đề. Kho Pro và câu đã duyệt mới được rút vào đề. Chuyển sang Free xóa giỏ và khóa kho dùng chung, ma trận, nhân bản AI; kho cá nhân và soạn câu vẫn dùng được.

Biến thể AI và gợi ý lời giải là **mô phỏng**, không gọi dịch vụ AI hay phát sinh chi phí. Các biến thể có số liệu/đáp án nhất quán nhưng có thể đổi chuyên đề; giao diện nhắc giáo viên rà soát trước khi duyệt. Import cung cấp đường dẫn tới Số hóa đề AI và lựa chọn nhập mẫu; không giả vờ đã đọc PDF thật.

## Đề kiểm tra

Ma trận chỉ rút câu đã duyệt, đúng môn, khối, chuyên đề và số câu từng mức độ. Thiếu câu thì hiển thị số hiện có; không bù câu sai mức độ hoặc lặp lại câu. Mỗi đề phải cùng môn và khối. Tạo tối đa 20 mã, trộn thứ tự câu và 4 phương án trắc nghiệm, cập nhật chỉ số đáp án đúng và ký tự đáp án trong lời giải mẫu. Thứ tự mệnh đề Đúng/Sai được giữ nguyên.

Tổng điểm luôn bằng 10, phân phối theo đơn vị 0,01 điểm để tránh sai tổng do làm tròn. Điểm câu được hiển thị tại màn hình xem trước. Rubric mẫu trong lời giải được quy đổi theo điểm câu.

JSON chứa `version`, `title`, `subject`, `grade`, `source`, `createdAt`, `totalPoints`, `variants[]`; mỗi variant có `code` và `questions[]` gồm câu hỏi, đáp án, lời giải và điểm. Chuyển sang Kiểm tra & Luyện thi lưu bản nháp tại `maihoc:question-bank:exam:<userId>`, hiển thị trong trang đích. Đây là **bản nháp chưa phát hành cho học sinh**. Tệp JSON có đáp án, dành cho giáo viên; backend cần tách đáp án khi phát hành đề cho học sinh.

## Nối Backend

`mountQuestionBank(container, user, onNavigate, { repository })` nhận repository đồng bộ hoặc bất đồng bộ:

```js
{
  list: () => Question[] | Promise<Question[]>,
  save: question => boolean | Promise<boolean>,
  approve: id => boolean | Promise<boolean>,
  remove: id => boolean | Promise<boolean>
}
```

Mặc định là local repository. Trả `true` khi lưu thành công, `false` khi chỉ giữ được trong bộ nhớ; reject/throw với thông báo lỗi khi request thất bại. Khi nối máy chủ, thay thông báo nguồn dữ liệu và xác nhận lưu ở view để phản ánh đúng trạng thái đồng bộ.

Question có `id`, `subject`, `grade` (chuỗi), `topic`, `type`, `level` (`nb/th/vd/vdc`), `stem`, `choices`, `answer`, `solution`, `status` (`draft/approved`), `bank` (`school/pro`), `owner`, `author`, `reviewer`, `attempts`, `rate`, `uses`, `ai`, `createdAt`.

Các API hiện có trong [platform routes](../server/platform/routes.js):

- `GET /api/platform/context`: trường và vai trò.
- `GET /api/platform/schools/:schoolId/questions`: danh sách `items`.
- `GET /api/platform/schools/:schoolId/curriculum`: chuyên đề `nodes`.
- `POST /api/platform/schools/:schoolId/questions`: lưu phiên bản, dùng `previousVersionId` khi sửa.
- `POST /api/platform/schools/:schoolId/questions/:questionId/approve`: duyệt.

Ánh xạ `topic_name → topic`, `curriculum_node_id → curriculumNodeId`, `grade → String(grade)`. API hiện tại nhận đáp án trắc nghiệm là chuỗi chỉ số từ 0 và đáp án Đúng/Sai là chuỗi JSON boolean. Giao diện dùng number/boolean[] tương ứng, nên adapter cần chuyển đổi hai chiều. API hiện chỉ hỗ trợ khối số 1–12, chưa hỗ trợ giá trị `IELTS/THPT`; phải mở rộng schema/validation trước khi lưu các khối này thật.

Backend hiện chưa lưu đầy đủ `level`, `solution`, phạm vi kho cá nhân/Pro và analytics từng câu. Cần thêm các trường này cùng API AI, ma trận, xuất/phát hành đề nếu muốn chuyển từ trải nghiệm local sang vận hành thật. Không ghi metadata vào trường `source` để tránh làm mất dữ liệu.

Công tắc Free/Pro chỉ kiểm thử UI, không thay đổi quyền hay gói thật. Backend phải kiểm tra membership, vai trò và entitlement tại mỗi API; không tin `bank`, `owner`, `status` hoặc công tắc gửi từ trình duyệt.

## Kiểm thử

```text
node --test tests/question-bank.test.js
node scripts/question-bank-check.mjs
```

Browser check dùng dữ liệu PostgreSQL cô lập của preview, tắt platform flag, đăng nhập giáo viên thử nghiệm và Edge headless đã cài trên Windows. Có thể đổi kênh trình duyệt bằng `PLAYWRIGHT_CHANNEL`. Kiểm tra lọc kết hợp, tab, duyệt, các editor, persistence, biến thể, trộn đề, báo thiếu câu, tải JSON, chuyển trang, Free/Pro, theme, overflow mobile và lỗi JavaScript. Ảnh QA nằm trong thư mục `test-results` được Git bỏ qua.

Sau `npm install`, chạy `node scripts/vendor-question-math.mjs` nếu cần phục vụ source trực tiếp. Quy trình build hiện có tự tạo và kiểm tra bundle KaTeX cùng giấy phép trong thư mục vendor.

## Xóa và lọc trùng

Admin/giáo viên có nút **Xóa câu hỏi**, kèm xác nhận. Local repository xóa câu khỏi kho của tài khoản và giỏ đang chọn; đề đã xuất/bản nháp đã tạo vẫn giữ snapshot. Adapter tùy chỉnh cần cung cấp `remove(id)` để hiển thị nút xóa. Giao diện mặc định vẫn dùng local repository, chưa tự chuyển sang API PostgreSQL.

Danh sách, KPI, tồn kho ma trận và đề được lọc tự động theo môn + khối + dạng + nội dung + tập phương án (không phụ thuộc mã, thứ tự phương án, đáp án hoặc metadata). Chuẩn hóa Unicode và khoảng trắng; giữ phân biệt chữ hoa, dấu, số và toán tử để tránh gộp nhầm biến/công thức. Bộ lọc này phát hiện nội dung trùng theo quy tắc trên, chưa so sánh tương đồng ngữ nghĩa/paraphrase. Bản trùng cũ chỉ ẩn khi hiển thị/rút câu, không tự xóa dữ liệu. Các mã đề vẫn dùng chung tập câu và trộn thứ tự như trước.

Biến thể mô phỏng bỏ qua câu đã có; lưu câu mới/sửa trùng báo lỗi. Thiếu câu duy nhất theo ma trận thì báo thiếu, không lặp câu để bù số lượng.

API School bổ sung `DELETE /api/platform/schools/:schoolId/questions/:questionId`: kiểm tra đăng nhập, same-origin, membership giáo viên/admin; archive mọi phiên bản của câu, ghi audit và giữ lịch sử bài làm. API danh sách bỏ câu archive/phiên bản cũ, lọc trùng; POST câu hỏi chặn trùng với HTTP 409 và khóa theo trường để tránh ghi trùng đồng thời. Số hóa đề tái sử dụng câu đã có và loại mã trùng trong kết quả publish. API giao bài chặn nội dung trùng khác ID; luyện chuyên đề rút tối đa 10 câu duy nhất. Không cần migration mới vì schema đã hỗ trợ `archived`.

## Ngày thêm và trạng thái làm bài cá nhân

Cả `/school/question-bank` và `/learning/national-exams` có hai bộ lọc kết hợp với từ khóa/môn/khối/dạng/mức độ hiện có:

- **Ngày thêm**: Mới nhất → Cũ nhất (mặc định), hoặc Cũ nhất → Mới nhất.
- **Trạng thái làm bài**: Chưa làm → Đã làm (mặc định), Chỉ chưa làm, Chỉ đã làm, Tất cả · Theo ngày thêm.

Khi nhóm theo trạng thái, câu/đề chưa làm đứng trước và sắp theo ngày thêm; nhóm đã làm sắp theo thời điểm làm gần nhất với chiều thời gian đã chọn. Ngày thiếu hoặc không hợp lệ xếp cuối; mã nội dung phân định khi cùng thời điểm. Bộ lọc không thay đổi thứ tự dữ liệu đã lưu. Đặt lại trả về mặc định; chuyển tab giữ bộ lọc.

Trạng thái câu hỏi được đối chiếu bằng fingerprint nội dung, không dùng tổng `attempts` của người học khác. `GET /api/question-bank/history` chỉ trả lịch sử tài khoản hiện tại từ bài School đã nộp và phiên THPT đã nộp; câu bỏ trống không được tính đã làm. API trả fingerprint và thời điểm, không trả đáp án/lời giải. Lỗi tải lịch sử sẽ tạm khóa lọc trạng thái và thông báo, không tự coi các câu là chưa làm. Kho local vẫn lưu trên trình duyệt; dữ liệu trạng thái cá nhân lấy từ máy chủ.

Đề THPT dùng `createdAt` và `lastCompletedAt` từ API. Ngày thêm đề tài liệu là `uploaded_at`. Ngân hàng đề bổ sung cột `created_at` ổn định khi khởi tạo; đề cũ không có ngày tạo dùng `updated_at` được ghi nhận tại lần nâng cấp làm mốc thay thế, không thay đổi khi sửa đề về sau. Câu local mới/biến thể lưu thời điểm ISO đầy đủ; dữ liệu cũ có độ chính xác ngày được giữ nguyên. Tổng lượt làm và năm của đề không được dùng làm lịch sử cá nhân hay ngày thêm.
