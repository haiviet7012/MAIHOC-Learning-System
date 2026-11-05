# Ngữ văn: blueprint và engine rubric riêng

## Phạm vi

- `configs/grading/ngu-van.json` là nguồn cấu hình; `configs/exam-layouts.json` là bản tổng hợp.
- Engine: `server/grading/literature-engine.js`. Adapter AI tùy chọn: `literature-ai.js`.
- Có API HTTP riêng `POST /api/admin/literature/grade` dành cho giáo viên/admin; chưa thêm giao diện duyệt đề/duyệt điểm mới. Không tự kích hoạt môn trong subjects.json.
- Luồng submit Learning cũ tiếp tục nhận và lưu bài nhưng không được so khớp Ngữ văn với đáp án mẫu: gradeAnswers trả pending khi grading.engine là literature-rubric-v1. Chưa tự gọi AI trên endpoint submit công khai.
- School có luồng chấm riêng trong tests-module; chưa chuyển sang engine này. Khi nối School, phải dùng gradeLiteratureSubmission/reviewLiteratureGrade thay vì evaluateTestSubmission cho Ngữ văn.
- Không thêm dependency, migration database hoặc thay cơ chế chấm các môn còn lại.

## Thang điểm theo yêu cầu sản phẩm

Đây là blueprint theo criteria được cung cấp cho MAIHOC, không phải tuyên bố về mọi đề thi chính thức.

| Câu | Điểm |
| --- | ---: |
| I-1 | 0.5 |
| I-2 | 0.5 |
| I-3 | 1 |
| I-4 | 1 |
| I-5 | 1 |
| II-1: đoạn nghị luận xã hội khoảng 200 chữ | 2 |
| II-2: bài nghị luận văn học | 4 |

II-1: xác định vấn đề 0.25; lập luận/giải thích/bàn luận 1; diễn đạt/dùng từ/chính tả 0.5; sáng tạo 0.25.

II-2: xác định vấn đề/cấu trúc/dẫn chứng/luận điểm 1; triển khai và phân tích 2.5; sáng tạo 0.5. Tiêu chí 1 điểm được giữ thành một nhóm để không tự đặt thêm trọng số.

Đọc hiểu có thể điều chỉnh pointsByQuestion cùng criteriaByQuestion theo từng blueprint, nhưng bắt buộc đủ 5 câu, tổng 4 điểm. Viết giữ 2 và 4 điểm. Bước điểm 0.25 là lựa chọn triển khai, có thể bổ sung chính sách khác sau.

## Đọc đề

`prepareLiteratureExam({ sourceText, generate })` nhận văn bản đề đã trích xuất, trả bản draft gồm:
- schemaVersion: 1; reviewStatus: draft.
- passage: ngữ liệu đọc hiểu nguyên văn, giữ xuống dòng thơ.
- source: nguồn trích.
- questions: đúng 7 targetId I-1..I-5, II-1, II-2; mỗi câu có questionText, guidance và context.
- context chứa toàn bộ đoạn trích riêng của câu viết khi khác passage.
- Maximum và criteria lấy từ blueprint, không tin trọng số do AI trả về.

AI có thể đề xuất guidance; giáo viên phải đọc lại, chỉnh và xác nhận toàn bộ ngữ liệu/câu hỏi/hướng dẫn chấm ở backend trước khi đặt reviewStatus = approved. Không nhận trạng thái approved từ request học sinh.

PDF/DOCX/ảnh cần bước trích văn bản hoặc OCR ở tầng nhập liệu trước khi gọi module. Bản này không thêm OCR mới. Đề trích thiếu câu hoặc thiếu ngữ liệu bị từ chối; không tự cắt văn bản dài để vừa giới hạn. Nếu đề không có đáp án chính thức, guidance AI chỉ là bản nháp để giáo viên biên soạn lại.

## Chấm và duyệt điểm

```js
import {
  prepareLiteratureExam, gradeLiteratureSubmission, reviewLiteratureGrade
} from "../../server/grading/literature-engine.js";
import { createLiteratureGenerator } from "../../server/grading/literature-ai.js";

const generate = createLiteratureGenerator(); // Provider selected by LITERATURE_AI_PROVIDER; dedicated key/model.
const draft = await prepareLiteratureExam({ sourceText: extractedText, generate });
// Save draft; teacher reviews it in a separate authorized backend operation.
// Later load the approved exam and student answers from server storage.
const proposal = await gradeLiteratureSubmission({ exam: approvedExam, answers, generate });
// proposal.score === null, proposal.proposedScore may contain 0..10.
// Save the proposal separately from official score.

// On an authenticated teacher/admin route, use server-owned reviewer identity.
// review contains questions with criterion-level scores, feedback, exact evidence and confidence.
// A teacher can create these rows manually, without AI.
const official = reviewLiteratureGrade({
  exam: approvedExam, answers, review: reviewedCriterionRows, reviewerId: req.user.id
});
```

Module không xác thực quyền; caller phải xác thực giáo viên/admin, quyền trên bài, chống CSRF, giới hạn tần suất gọi AI, và lấy đề/bài làm từ storage thay vì tin request. Không gọi adapter AI trực tiếp từ trình duyệt hoặc lộ API key.

Đầu ra AI:
```json
{
  "questions": [{
    "targetId": "I-1",
    "confidence": 0.95,
    "criteria": [{
      "id": "content",
      "points": 0.5,
      "feedback": "Nêu đúng ý, có căn cứ từ ngữ liệu.",
      "evidence": ["trích nguyên văn trong bài làm"]
    }]
  }]
}
```

Phải trả đủ mọi câu có bài làm, không trả câu trống. Mỗi câu phải đủ đúng các ID tiêu chí. Điểm phải là number hữu hạn, đúng bước và trong trần tiêu chí. Điểm dương bắt buộc có trích dẫn nguyên văn bài học sinh; việc tồn tại trích dẫn chỉ kiểm tra được căn cứ có thật, không chứng minh nhận xét AI đúng về ngữ nghĩa.

Bài trống được đề xuất 0 mà không gọi provider. Thiếu đề đã duyệt/ngữ liệu/guidance, thiếu provider, lỗi API/JSON, ID trùng/lạ, điểm sai hoặc trích dẫn bịa đều trả pending_review với score = null. Confidence thấp hơn 0.75 cũng không có tổng điểm đề xuất; confidence do model tự báo chỉ là tín hiệu để yêu cầu duyệt, không phải xác suất đã hiệu chuẩn.

Kết quả hợp lệ của AI là provisional, graded = false, score/percent = null; điểm gợi ý nằm ở proposedScore/proposedPercent. Chỉ reviewLiteratureGrade trả graded = true và score chính thức, kèm reviewedBy/reviewedAt. Caller phải lưu audit bản rubric, đề, bài, proposal, chỉnh sửa và người duyệt; module không tự ghi database.

Không chấm bằng khớp từ khóa, độ giống văn mẫu hoặc số chữ. wordCount là ước lượng đơn vị cách nhau bởi khoảng trắng; không phải tách từ tiếng Việt và không tự trừ điểm ngoài khoảng 200 chữ.

System instruction tách khỏi dữ liệu bài làm và bỏ qua chỉ dẫn thay rubric trong bài; vẫn cần người duyệt, không coi đây là bảo đảm chống prompt injection tuyệt đối.

## API chấm Văn riêng

`POST /api/admin/literature/grade` dùng session đăng nhập và middleware `requireAdmin` (giáo viên hoặc admin) cùng `requireSameOrigin` hiện có. Học sinh hoặc khách không được gọi API này.

Body chỉ gồm `exam` và `answers`. `exam` tuân theo schema ở trên, `reviewStatus: "approved"`, đủ 7 câu, ngữ liệu và guidance; giáo viên/admin chịu trách nhiệm về bản đề gửi để chấm thử. `answers` ánh xạ ID `I-1`..`I-5`, `II-1`, `II-2` sang văn bản bài làm. Câu thiếu được coi là bỏ trống. Mỗi câu tối đa 30000 ký tự; tổng JSON tối đa 512 KiB. Không nhận API key, model hoặc blueprint từ request.

```js
const response = await fetch("/api/admin/literature/grade", {
  method: "POST",
  credentials: "same-origin",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ exam: approvedExam, answers: studentAnswers })
});
const result = await response.json();
```

| HTTP | Ý nghĩa |
| --- | --- |
| 200 | Kết quả đề xuất: `gradingStatus: "provisional"`, `graded: false`, `score: null`, điểm ở `proposedScore` |
| 202 | AI lỗi, độ tin cậy thấp hoặc kết quả không hợp lệ; `pending_review`, không tạo điểm 0 giả |
| 400 / 413 | Đề/bài làm không hợp lệ hoặc vượt giới hạn dung lượng |
| 401 / 403 | Chưa đăng nhập, không có quyền hoặc khác nguồn gốc |
| 429 | Vượt 12 yêu cầu/phút/người dùng, có header `Retry-After` |
| 503 | Thiếu hoặc sai cấu hình riêng Ngữ văn: `LITERATURE_AI_NOT_CONFIGURED` |

API trả `Cache-Control: private, no-store`. Giới hạn tần suất theo từng tiến trình backend. API này chấm thử stateless cho giáo viên/admin: chưa ghi bài/điểm vào database hoặc công bố điểm chính thức. Chưa thay thế luồng submit Learning/School. Khi triển khai API cho học sinh, phải lấy đề đã duyệt từ storage theo ID và kiểm tra quyền với bài thay vì nhận `exam` từ học sinh.

## Cấu hình và kiểm thử

Điền các giá trị thật trong `server/.env` hoặc Environment của backend (Render), không commit key. Mặc định tiếp tục dùng Gemini nếu không đặt provider:

```dotenv
LITERATURE_AI_PROVIDER=gemini
LITERATURE_AI_API_KEY=
LITERATURE_AI_MODEL=
```

Để sử dụng model do NVIDIA API Catalog phục vụ:

```dotenv
LITERATURE_AI_PROVIDER=nvidia
LITERATURE_AI_API_KEY=
LITERATURE_AI_MODEL=
LITERATURE_AI_BASE_URL=https://integrate.api.nvidia.com/v1
LITERATURE_AI_MAX_TOKENS=4096
LITERATURE_AI_TIMEOUT_MS=45000
```

Key cần là key NVIDIA; model là ID chính xác dạng `namespace/model` từ trang model trong NVIDIA API Catalog, không phải tên hiển thị. ID có thể thuộc NVIDIA hoặc nhà phát triển model khác được NVIDIA phục vụ. Không hardcode model mặc định; điền model đã xác minh với tài khoản provider. Không tự đổi provider khi lỗi, không fallback sang `GEMINI_API_KEY` hoặc `GEMINI_SOLUTION_API_KEY`.

`literatureConfig()` kiểm tra provider và cấu hình trước khi gọi. Adapter NVIDIA dùng `POST /v1/chat/completions`, Bearer token ở header, `system` instruction tách khỏi dữ liệu bài làm, `stream:false`. Chỉ hỗ trợ NVIDIA cloud ở base URL trên; không tự chuyển key tới host khác hoặc theo redirect. Bản này chưa hỗ trợ NIM tự host.

Giới hạn max_tokens mặc định 4096, có thể cấu hình 256–32768 nhưng phải nằm trong khả năng của model đã chọn. Timeout NVIDIA mặc định 45000 ms, cho phép 1000–180000 ms. Gemini giữ timeout 45 giây hiện có. Nếu NVIDIA trả phản hồi chờ HTTP 202, bị cắt vì hết token, chỉ có reasoning, sai JSON, hoặc API lỗi, bài chuyển `pending_review`; không lấy một phần phản hồi làm điểm và không tự polling. Các tham số riêng của từng model như reasoning_effort không được suy đoán hoặc tự thêm.

Cấu hình đọc khi gọi AI nên không chặn server khởi động khi key/model còn trống. Bài trống được đề xuất 0 mà không cần provider. `createLiteratureGenerator()` áp dụng provider đã chọn cho cả module đọc đề và chấm bài. Các override backend `apiKey` và `modelName` nếu dùng phải có đủ cả hai; khi chỉ định key/model thủ công cho NVIDIA, truyền thêm `provider: "nvidia"`. API HTTP không nhận các override này từ client. Các kết nối AI ngoài engine Văn giữ cấu hình hiện có.

Restart backend sau khi sửa `.env`; cấu hình trên host tiếp tục có ưu tiên cao hơn file `.env`. `npm run ai:check` kiểm tra cấu hình offline cho cả hai provider. Với NVIDIA, `npm run ai:check -- --generate` gửi một yêu cầu JSON nhỏ để xác minh kết nối; có thể dùng quota. `-- --live` không tự coi kết nối NVIDIA đã được xác minh, mà trả `NVIDIA_GENERATE_CHECK_REQUIRED` và yêu cầu kiểm tra bằng `--generate`.

Tài liệu protocol tham chiếu: [NVIDIA LLM APIs](https://docs.api.nvidia.com/nim/reference/llm-apis), [Chat Completions](https://docs.api.nvidia.com/nim/reference/openai-gpt-oss-120b-infer). Khả năng và giới hạn tham số thay đổi theo model; xem trang model được cấu hình trước khi triển khai.

```sh
node scripts/sync-grading-configs.js
node --test tests/nvidia-literature.test.js tests/literature-api.test.js tests/literature-grading.test.js tests/grading-config.test.js tests/subject-config.test.js
npm test
npm run build
npm run check:dist
```

Các test dùng provider giả, không gửi bài làm ra dịch vụ thật, không tốn quota. Trước khi tự động công bố điểm AI trong tương lai, cần tập bài giáo viên đã chấm và đối chiếu sai lệch theo từng tiêu chí, dạng đề và mức điểm.

## Gia sư trên trang môn Văn

Môn Ngữ văn được bật với bốn ô: đọc hiểu, làm văn, tổng hợp và gia sư.
Kho đề dùng tài liệu Ngữ văn sẵn có, phân nhóm bằng `literatureSection`
(`reading`, `writing`, `combined`) hoặc từ khóa trong tiêu đề/mô tả. Không tạo đề mẫu giả.

Gia sư hỗ trợ đoạn nghị luận xã hội (2 điểm) và bài nghị luận văn học (4 điểm).
`POST /api/literature/tutor` yêu cầu đăng nhập, cùng origin, tối đa 6 lượt/phút/người,
body `{prompt, answer, kind:"II-1"|"II-2", confirmed:true}`. Rubric lấy từ server;
đề cá nhân là draft và kết quả chỉ là điểm luyện tập, không lưu điểm chính thức.
Đề tối đa 12000 ký tự, bài làm tối đa 30000 ký tự.

`POST /api/literature/transcribe` nhận `{image:"data:image/jpeg;base64,..."}`
(JPG/PNG/WebP, tối đa 6 MB), đọc chữ in/viết tay bằng adapter AI tài liệu hiện có.
Cấu hình `SCHOOL_DOCUMENT_AI_API_KEY` và `SCHOOL_DOCUMENT_AI_MODEL` với model Gemini
có khả năng đọc ảnh. Đây là bước đọc ảnh riêng; chấm bài dùng NVIDIA với
`LITERATURE_AI_PROVIDER`, `LITERATURE_AI_API_KEY`, `LITERATURE_AI_MODEL` như trên.
Không cần bật School beta để dùng API này. Ảnh không được lưu trên server.
Người học có thể tải/dán từng trang, xem ảnh gốc, sửa bản chép và xác nhận trước khi chấm.
Không đảm bảo đọc chính xác mọi nét chữ; vùng mờ phải được người học bổ sung.
