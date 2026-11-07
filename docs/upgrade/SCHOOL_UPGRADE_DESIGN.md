# MAIHOC School — Thiết kế nâng cấp gói trả phí

Ngày: 03/11/2026. Trạng thái: đặc tả đề xuất, chưa phải chức năng đã triển khai.

Căn cứ: báo cáo MAIHOC_Tong_hop_tinh_nang_School(1).pdf do người dùng cung cấp; mã nguồn nhánh main tại commit `2ea919d4adfbdaa7000c55dc1fc9c12d62f24857`. Chưa kiểm chứng bản đang chạy trên Render. Phạm vi tập trung vào sáu yêu cầu học sinh và luồng giáo viên duyệt phụ đạo; các đề xuất khác trong báo cáo không tự động được đưa vào đợt này.

## 1. Nguyên tắc nâng cấp

- Nâng cấp tại module đang có: mô phỏng, phòng tự học, cố vấn, ngân hàng câu hỏi và kết quả học tập.
- Chỉ tạo engine nghiệp vụ mới cho số hóa đề và đọc vở; dùng chung các tầng nhận diện tài liệu, lưu tệp và xuất PDF.
- Hai không gian Learning và School dùng chung tài khoản, giữ điều hướng riêng. Quyền trả phí kiểm tra tại backend trên từng thao tác và tài nguyên.
- Giữ PostgreSQL, R2, backend Node và cách khởi động `node server.js`. Video/ghi hình và xử lý tài liệu dài dùng dịch vụ hoặc worker riêng, không chạy tác vụ nặng trong request web.
- Full chức năng AI nghĩa là đủ chế độ sử dụng, có hạn mức và ngân sách; không đồng nghĩa số lượt không giới hạn.

## 2. Đối chiếu module và sidebar

| Yêu cầu | Bằng chứng trong repo | Cách thực hiện | Điều hướng School |
|---|---|---|---|
| Thí nghiệm 2D + 3D | `physics-lab/core/simulation-renderer.js` dùng canvas 2D; có simulation engine, registry và catalog | Giữ engine mô phỏng, thêm renderer 3D và mô hình cần tọa độ 3D | Thêm lối vào **Thí nghiệm**; bên trong có tab 2D/3D |
| Phòng tối đa 50 người | `server/study-rooms/server.js` giới hạn 12; client tạo WebRTC peer riêng; trạng thái phòng trong bộ nhớ | Nâng cấp cùng module phòng, bổ sung transport SFU, phòng School, chia sẻ và ghi hình | Thêm lối vào **Phòng học School** dùng chung module; Learning giữ Phòng tự học |
| Cố vấn AI đầy đủ | `server/learning-advisor/` có dữ liệu, lộ trình, cố vấn giáo viên; School có nút Cố vấn AI | Nâng cấp engine và hành động trong màn hình hiện tại | Giữ **Cố vấn AI** |
| Số hóa đề/đáp án | Có `question_versions`, duyệt câu hỏi, tạo assessment; chưa thấy pipeline OCR hoàn chỉnh trong các module đã kiểm tra | Thêm workflow số hóa, đưa câu đã duyệt vào ngân hàng hiện tại | Thêm **Số hóa đề AI** |
| Đọc và sửa vở | Có AI giải bài, chưa thấy workflow hồ sơ vở và sửa theo vùng trong phần đã kiểm tra | Thêm workflow đọc vở, tái sử dụng tầng AI và xuất tài liệu | Thêm **Vở học AI** |
| Lỗ hổng và phụ đạo | `analytics.js` đã đếm đúng/sai theo chuyên đề; platform có luyện chuyên đề | Nâng cấp phân tích, bằng chứng, bản nháp phụ đạo và duyệt giao | Giữ **Kết quả học tập**, thêm tab; nối Cố vấn giảng dạy |

Như vậy có hai module nghiệp vụ mới; sidebar thêm bốn lối vào vì thí nghiệm và phòng School cần truy cập trực tiếp. Không tạo nút riêng cho chia sẻ màn hình, ghi hình, chat phòng hoặc từng chế độ AI.

Học sinh thấy: Bài được giao; Kiểm tra và luyện thi; Thời khóa biểu; Lớp của bạn; Thí nghiệm; Phòng học School; Cố vấn AI; Số hóa đề AI; Vở học AI; Kết quả học tập; IELTS hiện có. Các mục quản trị và ngân hàng câu hỏi không cấp quyền chỉnh sửa cho học sinh.

Giáo viên dùng cùng các công cụ phù hợp vai trò; giữ Ngân hàng câu hỏi, Cố vấn giảng dạy, Kết quả học tập. Trong Số hóa đề AI có khu vực duyệt và xuất bản; trong Kết quả học tập có tab Nhóm phụ đạo.

## 3. Quyền lợi và phân quyền

| Khả năng | Learning | School |
|---|---|---|
| Mô phỏng | 2D hiện có | 2D và 3D; lưu phiên và báo cáo |
| Phòng | Giữ phòng cơ bản với giới hạn hiện tại | 50 người tham gia, chia sẻ, MP4, AI trong phòng |
| AI | Giữ phạm vi hiện hữu; hạn mức miễn phí là cấu hình sản phẩm riêng | Gợi mở, giải chi tiết, kiểm tra bài, giải thích lỗi, lộ trình, theo dõi |
| Số hóa đề và vở | Không cấp tính năng mới trong đợt này | Có hồ sơ riêng, xuất PDF; giáo viên có quyền duyệt vào kho trường |
| Phân tích | Tiến trình cá nhân hiện có | Bằng chứng theo câu, đề xuất bổ trợ và phụ đạo có duyệt |

Thêm kiểm tra entitlement gồm gói đang hiệu lực, thành viên trường, lớp/môn và quyền trên tài nguyên. `canAccessSchool` hiện là cổng truy cập rộng theo role/plan, chưa đủ thể hiện toàn bộ chính sách này. Giữ tương thích tài khoản legacy và chuyển đổi có nhật ký; không tự thu hồi quyền cũ chỉ vì bật bộ quyền mới.

Mã quyền đề xuất: `lab.3d`, `room.school`, `room.screen_share`, `room.record`, `room.ai`, `document.digitize`, `notebook.review`, `advisor.full`, `remediation.approve`. Đây là tên thiết kế mới, chưa tồn tại trong repo.

## 4. Thí nghiệm 2D và 3D

Một danh mục thí nghiệm, bộ tham số và công thức dùng chung khi phù hợp. Renderer 2D và 3D chỉ phụ trách trình bày; thí nghiệm cần trạng thái không gian phải bổ sung mô hình vật lí và kiểm định kết quả, không chỉ dựng hình 3D.

Luồng: chọn thí nghiệm → chọn 2D/3D → thay tham số/chạy/dừng/đặt lại → ghi số đo → lưu phiên → xuất báo cáo. School có xoay/phóng to/cắt lớp mô hình khi thí nghiệm hỗ trợ. Nếu thiết bị không hỗ trợ WebGL, hiển thị lựa chọn quay về 2D và giữ dữ liệu phiên.

Phạm vi khởi đầu đề xuất: ba thí nghiệm 3D được chọn từ nội dung Vật lí hiện có, ưu tiên trực quan từ trường và chuyển động điện tích; phải xác nhận công thức, đơn vị và phạm vi mô hình trước khi đưa vào catalog. Không hứa tất cả thí nghiệm 2D tự động có bản 3D.

Backend chặn tải dữ liệu hoặc thao tác School không được cấp quyền. Mã chạy phía trình duyệt không thể bảo đảm chống sao chép; quyền sản phẩm tập trung ở danh mục cấp phép, lưu phiên và tài nguyên dịch vụ.

## 5. Phòng học School 50 người

### Quy mô và lớp truyền thông

Chốt thiết kế: tối đa 50 tài khoản con người tham gia đồng thời, gồm chủ phòng/giáo viên; bot ghi hình và AI dịch vụ không chiếm ghế. Ghế được giữ nguyên tử phía server, reconnect không nhân đôi tài khoản và không lách bằng tab thứ hai. Nếu sau này cần 50 học sinh cộng giáo viên thì phải đổi hợp đồng sức chứa và kiểm thử lại.

Giữ lobby, chat, giơ tay và cách gắn tài khoản hiện có. Thêm transport adapter: phòng Learning tiếp tục transport cũ; phòng School dùng SFU, đề xuất LiveKit. Không dùng mô hình mỗi người gửi video trực tiếp cho 49 người còn lại. Server hiện tại cấp token phòng có hạn ngắn sau khi xác minh quyền; SFU xử lý media, backend vẫn quản lí nghiệp vụ.

Lưu metadata phòng, lịch buổi học, thành viên, quyền chủ trì và bản ghi trong PostgreSQL. Presence và signaling đặt ở SFU hoặc kho dùng chung phù hợp; không dựa vào một Map trong Node để bảo đảm giới hạn nhiều tiến trình.

### Điều khiển trong phòng

- Thanh dưới: Mic, Camera, Giơ tay, Chia sẻ màn hình, Ghi hình, AI phòng học, Rời phòng.
- Chủ phòng có quyền cho vào, mời ra, khóa phòng, chỉ định người trình bày, bắt đầu/dừng ghi hình.
- Một luồng chia sẻ màn hình tại một thời điểm ở bản đầu. Khi trình duyệt dừng chia sẻ, trạng thái phòng phải cập nhật và giải phóng quyền trình bày.
- Chỉ tải video đang hiển thị và người đang nói; không giải mã 49 camera cùng lúc trên điện thoại. Có chế độ giảm chất lượng/chỉ âm thanh.
- Hiển thị rõ người/bot đang ghi hình và trạng thái ghi; không mở rộng cơ chế quan sát ẩn hiện có sang luồng ghi hình School.

### Ghi hình và MP4

Luồng: yêu cầu ghi → thông báo và xác nhận tham gia ghi hình → bắt đầu dịch vụ ghi → ghi audio/camera/màn hình theo bố cục → dừng → xử lý/kiểm tra MP4 → lưu R2 → xem hoặc tải.

Trạng thái: `starting`, `recording`, `stopping`, `processing`, `ready`, `failed`. Không hiện “đã lưu” trước khi tệp tồn tại và phát được. Khi chủ phòng mất kết nối, dịch vụ ghi vẫn hoạt động theo chính sách; chuyển chủ trì hoặc tự dừng theo timeout, không làm mất tệp chỉ vì đóng trình duyệt.

MP4 phải có container/codec hợp lệ; không đổi đuôi WebM thành MP4. Bản đầu ghi khu vực họp chung, không ghi tin nhắn AI riêng hoặc thông báo cá nhân. Chat chung cần bản xuất riêng hoặc template ghi chuyên dụng nếu muốn xuất hiện trong video.

Đề xuất lưu 30 ngày, hạn mức phút ghi và dung lượng theo trường, quản trị có thể chỉnh. Link tải ký có thời hạn và kiểm tra quyền lại khi cấp; R2 private. Có xóa bản ghi và tác vụ dọn tệp hết hạn. Đây là mặc định đề xuất, chưa phải chính sách đã áp dụng.

Chia sẻ màn hình chỉ bật khi trình duyệt hỗ trợ và người dùng cấp quyền. Điện thoại/tablet vẫn có thể xem màn hình người khác; khả năng tự chia sẻ phải kiểm tra trên thiết bị thực. Không cam kết chia sẻ cả âm thanh hệ thống trên mọi trình duyệt.

### Chat AI trong phòng

Khung bên phải có Chat nhóm / AI phòng học. Học sinh gửi câu hỏi, ảnh hoặc tài liệu được phép sử dụng; mặc định hỏi AI riêng, bấm Chia sẻ câu trả lời để đăng ra phòng. Không tự đưa vở riêng hay toàn bộ lịch sử chat vào ngữ cảnh chung.

Engine phòng có scope `room` và cấu hình riêng đề xuất: `ROOM_AI_PROVIDER`, `ROOM_AI_API_KEY`, `ROOM_AI_MODEL`; không tự fallback sang key shared/advisor/exam. Key chưa có thì chỉ AI phòng báo chưa cấu hình; cuộc họp tiếp tục bình thường. Tái sử dụng lớp xử lí lỗi và timeout của `server/ai-provider.js`, thêm bộ điều phối riêng theo room/session.

API đề xuất: `POST /api/school/rooms/:roomId/ai/messages`. Server kiểm tra thành viên, entitlement, ngân sách, tệp đính kèm và kỳ thi đang diễn ra trước khi tạo job. Có chống gửi trùng, giới hạn hàng đợi, hủy và retry có kiểm soát. Tài liệu upload là dữ liệu, không có quyền thay đổi chỉ dẫn hệ thống hoặc quyền truy cập.

Một key riêng không bảo đảm quota độc lập nếu vẫn cùng project nhà cung cấp; muốn tách ngân sách thực cần cấu hình quota/billing thích hợp.

## 6. Số hóa đề AI và ghép đáp án

Luồng đáp ứng yêu cầu: ảnh/giấy viết tay hoặc PDF đề → nhận diện cấu trúc → đề nháp PDF → đối chiếu bản gốc → nhập ảnh/PDF đáp án → nhận diện đáp án → PDF đáp án → ghép từng câu → bộ đề hoàn chỉnh.

Nhận diện thành dữ liệu cấu trúc trước khi xuất PDF: mã câu, phần, nội dung, lựa chọn, hình minh họa, công thức, chuyên đề, đáp án và giải thích. Lưu tọa độ vùng nguồn, số trang, phiên bản model và kết quả người dùng sửa. PDF là sản phẩm xuất, không phải nguồn dữ liệu duy nhất.

Màn hình có các bước: Tải đề; Kiểm tra bản đọc; Tải đáp án; Ghép và đối chiếu; Xuất bản. Vùng bên trái là bản gốc, bên phải là câu đã nhận diện; nhấn câu để tô vùng nguồn.

Ghép bằng mã câu ổn định cùng số câu, phần và nội dung; không ghép chỉ theo thứ tự trang. Câu thiếu đáp án, trùng số, số câu lệch hoặc phương án không hợp lệ được đưa vào danh sách cần xử lí. Đáp án nguồn được phân biệt với lời giải AI tự sinh.

Người dùng có thể bỏ qua đối chiếu toàn bộ khi không có cảnh báo; điểm mơ hồ, thiếu câu hoặc ghép xung đột phải được xác nhận trước khi hoàn tất. Mức chắc chắn do AI tự báo không được coi là xác suất đã hiệu chuẩn.

Đầu ra: (1) đề trắng PDF; (2) đáp án PDF; (3) đề kèm đáp án/lời giải PDF. Học sinh chỉ quản lí bộ đề cá nhân. Đưa vào ngân hàng trường dùng `question_versions` trạng thái draft và luồng giáo viên duyệt hiện có.

Không đưa đáp án vào payload hoặc PDF của người làm bài trước thời điểm được phép công bố; không chỉ ẩn đáp án bằng CSS. Xuất đề cá nhân không có nghĩa được xuất bản đề thi chính thức cho lớp.

Job tài liệu có trạng thái queued/processing/needs_review/ready/failed; giới hạn trang, dung lượng và số job đồng thời. Upload lỗi được tiếp tục/thử lại; xử lí lại không tạo trùng bộ đề.

## 7. Vở học AI

Luồng: chụp/tải trang vở → chọn môn và bài → xem bản chép → sửa chữ/công thức AI đọc sai → phân tích → xem sửa bài hoặc xuất PDF hoặc mở Gia sư AI cùng ngữ cảnh.

Phản hồi theo từng vùng/bước: nguyên văn học sinh; loại lỗi đọc chữ hoặc lỗi học thuật; giải thích; gợi ý tiếp theo; bản sửa đề xuất. Không tự ghi đè ảnh gốc hoặc sửa bài gốc mà không lưu phiên bản. Vùng không đọc rõ phải hỏi lại/thông báo chưa đủ thông tin, không dựng thêm nội dung.

Ba chế độ: Gợi mở; Sửa từng bước; Giải chi tiết. Nút Chat với gia sư gửi phần đã chọn và bản đọc đã xác nhận tới engine gia sư hiện có, kèm tham chiếu hồ sơ, không bắt người dùng tải lại.

PDF phản hồi có ảnh/trích vùng nguồn, bản chép, vị trí lỗi, giải thích và bản sửa; ghi rõ phản hồi AI. Giáo viên chỉ xem vở khi học sinh nộp/chia sẻ trong phạm vi lớp được phân công. Nhận xét AI không tự trở thành điểm chính thức.

## 8. Phân tích lỗ hổng và phụ đạo có duyệt

Nâng cấp `server/learning-advisor/analytics.js` và endpoint analytics hiện có. Mở rộng từ số lượt đúng/sai sang bản ghi bằng chứng: học sinh, bài/lượt làm, phiên bản câu, chuyên đề, câu trả lời, kết quả chấm, ngày và nguồn.

Backend tính số liệu; AI diễn giải từ bằng chứng đã được phân quyền. Phân biệt kết quả giáo viên duyệt, bài tự luyện, phản hồi AI chưa duyệt và tiến trình tự đánh dấu. Không suy ra năng lực từ thời gian online hoặc số lần mở tài liệu.

Mỗi chuyên đề hiển thị số câu độc lập đã chấm, số lần đánh giá, thời gian quan sát, tỷ lệ sai và liên kết mở câu gốc. Báo dữ liệu bị cắt bởi giới hạn truy vấn, dữ liệu cũ, thiếu chuyên đề hoặc chưa chấm. Không cộng lượt làm lại cùng câu thành nhiều bằng chứng độc lập.

Quy tắc khởi đầu đề xuất, cần hiệu chỉnh bằng dữ liệu thật: dưới 5 câu độc lập hoặc chỉ một lần đánh giá → Thiếu dữ liệu; từ 5 câu và ít nhất hai lần đánh giá → Có cơ sở sơ bộ; từ 10 câu, ít nhất ba lần đánh giá và bao phủ nhiều dạng bài → Có thêm cơ sở. Đây là mức đủ bằng chứng theo quy tắc, không phải xác suất chính xác hay nhãn “mất gốc”. Nếu mẫu lệch nội dung vẫn hạ mức đánh giá.

Ví dụ minh họa, không phải dữ liệu thực: sai 6/10 câu về lực từ qua ba bài trong 30 ngày → gợi ý ôn xác định chiều lực; mở được sáu câu và bước sai; nếu cả mười câu lặp một dạng thì phải ghi hạn chế độ bao phủ.

Luồng phụ đạo: phân tích → AI đề xuất nhóm có chung lỗ hổng → giáo viên xem bằng chứng → sửa danh sách/mục tiêu/bài bổ trợ → duyệt → tạo bài trong hệ thống giao bài hiện có → kiểm tra lại → so sánh trước/sau với câu tương đương. Không tự giao bài chỉ sau khi AI sinh đề xuất.

Học sinh thấy việc cần luyện và tiến bộ cá nhân; giáo viên thấy nhóm trong lớp/môn được phân công. Không công khai danh sách “học sinh yếu” cho lớp. Cố vấn học sinh không cần khôi phục bảng điểm đã được yêu cầu bỏ; cung cấp liên kết tới minh chứng khi cần.

## 9. Tổ chức engine, dữ liệu và API

Tái sử dụng `server/ai-provider.js` cho chuẩn hóa cấu hình/lỗi; `server/learning-advisor/` cho cố vấn; `server/platform/routes.js` cho câu hỏi/assessment/analytics; `server/r2-storage.js` cho tệp. Tầng tài liệu mới dùng chung cho số hóa đề và vở, nhưng prompt, quyền và đầu ra theo từng workflow.

Các nhóm dữ liệu mới đề xuất, tên cần đối chiếu schema trước khi migration: entitlement và usage; room_sessions/members/recordings/ai_threads; document_jobs/source_regions/extracted_items/answer_matches; notebook_reviews/feedback_items; intervention_drafts/groups/assignments. Tận dụng `question_versions`, `assessment_items`, `attempt_answers`, `curriculum_nodes`, `audit_logs` hiện có thay vì tạo hệ thống đề và kết quả thứ hai.

Mỗi tài nguyên có owner hoặc school/class scope rõ; job giữ idempotency key, phiên bản xử lí và tham chiếu nguồn. PDF/video lưu R2, metadata lưu PostgreSQL. Không nhét binary hoặc base64 tài liệu dài vào bảng chat.

API mới đề xuất:

| Nhóm | Thao tác |
|---|---|
| Quyền | GET /api/school/capabilities |
| Phòng | POST /api/school/rooms/:id/token; POST /:id/recordings; POST /:id/recordings/:recordingId/stop |
| AI phòng | POST /api/school/rooms/:id/ai/messages |
| Tài liệu | POST /api/school/document-jobs; GET /:id; PATCH /:id/items; POST /:id/exports |
| Vở | POST /api/school/notebook-reviews; PATCH /:id/transcript; POST /:id/tutor-context |
| Phụ đạo | POST /api/school/interventions/drafts; PATCH /:id; POST /:id/approve-and-assign |

Các đường dẫn rút gọn trong cùng hàng tiếp nối prefix nhóm tương ứng. Mọi endpoint đều cần quyền tài nguyên, không chỉ cổng School chung. API hiện tại giữ tương thích; đây chưa phải danh sách endpoint đã lập trình.

Áp dụng chặn trợ giúp trong bài kiểm tra đang diễn ra cho mọi scope AI mới, tái sử dụng chính sách active exam hiện có. Không cho đường OCR, chat phòng hoặc đọc vở trở thành lối vòng nhận lời giải của kỳ thi.

## 10. Các đợt triển khai và nghiệm thu

| Đợt | Phạm vi | Điều kiện hoàn thành |
|---|---|---|
| 1 | Entitlement, quota/usage, sidebar và job/tệp nền tảng | Tài khoản cũ hoạt động; gọi API trực tiếp không vượt quyền; rollback bằng cờ tính năng |
| 2 | Số hóa đề, ghép đáp án, PDF; Vở học AI | Kiểm thử ảnh nghiêng/mờ, viết tay, công thức, bảng/hình, PDF nhiều trang; không ghép nhầm âm thầm; PDF tiếng Việt không lỗi font |
| 3 | Phòng School SFU, màn hình, AI riêng và MP4 | Thực nghiệm 50 người, chặn người thứ 51, reconnect đúng, ghi hình phát/tải được; key AI phòng độc lập |
| 4 | 3D và nâng cấp cố vấn/phụ đạo | Mô phỏng đúng phạm vi; bằng chứng mở được; giáo viên duyệt mới giao; theo dõi bài kiểm tra lại |

Nghiệm thu phòng với hai cấu hình riêng: 50 người gồm 1 người chia sẻ, một số camera bật; và 50 camera bật với giới hạn phân phối đã thiết kế. Đo join success, bitrate, RTT, packet loss, CPU/RAM thiết bị, độ trễ chat và chất lượng MP4 trên mạng trường và mạng di động. Mục tiêu đề xuất: ít nhất 95% lượt tham gia thành công trong 10 giây trên mạng kiểm thử đã định; không coi đây là SLA trước khi đo.

Chạy kiểm thử desktop/mobile/tablet; Chrome/Edge/Firefox/Safari theo ma trận hỗ trợ đã xác lập. Kiểm tra từ chối camera/mic/màn hình, hết quota, provider lỗi, restart web, worker retry, webhook trùng và người không có quyền mở link tệp. Ghi rõ hạn chế trình duyệt trong kết quả nghiệm thu.

Migration chỉ bổ sung và chạy lặp an toàn; bật theo trường thử nghiệm, đối chiếu lịch sử/ID trước khi mở rộng. Không yêu cầu sửa start command web chỉ để xử lí video hoặc OCR. Worker và SFU/recorder là thành phần vận hành cần cấu hình riêng; không cam kết phòng 50 người và ghi MP4 chạy trên hạ tầng miễn phí hiện tại.

Theo dõi chi phí theo phút người tham gia, phút ghi, GB lưu/truyền, trang OCR và token AI. Chốt hạn mức gói sau pilot; không tự đặt phí hoặc hứa thời gian xử lí khi chưa đo.

## 11. Nguồn đối chiếu

- Repo tại commit đã kiểm tra: https://github.com/haiviet7012/MAIHOC-Learning-System/tree/2ea919d4adfbdaa7000c55dc1fc9c12d62f24857
- Phòng: `server/study-rooms/server.js`, `study-rooms/client.js`. README có một số mô tả cũ; kết luận kiến trúc dựa trên mã đang đọc.
- Quyền: `server/school-access.js`, `js/platform/school-access.js`, `server/platform/policy.js`.
- Cố vấn/phân tích: `server/learning-advisor/analytics.js`, `routes.js`, `teaching.js`; `server/platform/routes.js`.
- Mô phỏng: `physics-lab/core/simulation-renderer.js`, `simulation-engine.js`.
- LiveKit SFU: https://docs.livekit.io/reference/internals/livekit-sfu/
- LiveKit Egress và MP4: https://docs.livekit.io/transport/media/ingress-egress/egress/
- Giới hạn chia sẻ màn hình: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia

Phần nguồn hiện trạng và phần thiết kế mới được phân biệt trong tài liệu. Không xác nhận đã triển khai, đã kiểm thử tải hoặc đã thay đổi repo từ bản thiết kế này.
