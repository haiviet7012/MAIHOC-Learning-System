# Kiểm tra và khôi phục các chức năng AI trên Render

## Chẩn đoán từ lỗi đã ghi nhận

Gia sư báo HTTP 401, `API key not valid`, reason `ACCESS_TOKEN_TYPE_UNSUPPORTED`: Google đã nhận request nhưng từ chối thông tin xác thực. Đây chưa phải bằng chứng model không tồn tại hoặc hết quota. Cố vấn trước đây che mọi lỗi ngoài 429 thành một thông báo chung nên không phân biệt được nguyên nhân. Không thể khẳng định key bị cắt, hết hạn hay project cấu hình sai chỉ từ ảnh.

Rà soát mã nguồn phát hiện `server/server.js` và `server/postgres.js` dùng dotenv với `override:true`, có thể khiến file `.env` cũ ghi đè Environment trên Render. Bản sửa giữ ưu tiên biến môi trường triển khai, chuẩn hóa khoảng trắng/dấu nháy bao ngoài, hỗ trợ `GOOGLE_API_KEY` khi key chính để trống, và sửa tài liệu Cố vấn bị mâu thuẫn. SDK hiện tại đã gửi `x-goog-api-key`; không quy kết lỗi cho định dạng AQ hoặc tự đổi tên model.

## Cấu hình được dùng

| Chức năng | API key theo thứ tự ưu tiên | Model theo thứ tự ưu tiên |
| --- | --- | --- |
| Gia sư văn bản/ảnh/PDF, giải Hóa, đánh giá độ khó, Gia sư chạy nền | GEMINI_API_KEY → GOOGLE_API_KEY | GEMINI_MODEL |
| Giải đề/tạo đáp án tự động | GEMINI_SOLUTION_API_KEY → GEMINI_API_KEY → GOOGLE_API_KEY | GEMINI_SOLUTION_MODEL → GEMINI_MODEL |
| Cố vấn học tập và Cố vấn giảng dạy | LEARNING_ADVISOR_API_KEY → GEMINI_API_KEY → GOOGLE_API_KEY | LEARNING_ADVISOR_MODEL → GEMINI_MODEL |

Để tách ba key, đặt riêng `GEMINI_API_KEY`, `LEARNING_ADVISOR_API_KEY` và `GEMINI_SOLUTION_API_KEY`. `GEMINI_SOLUTION_MODEL` chỉ là tên model, không chứa API key. Engine giải đề tạo đáp án/rubric để phục vụ chấm; phần đối chiếu và tính điểm vẫn theo engine chấm hiện hữu.

Biến trống hoặc chỉ có khoảng trắng được bỏ qua. Key riêng đã đặt nhưng không hợp lệ vẫn được báo lỗi; hệ thống không tự dùng key khác để che lỗi. Bỏ cả hai biến LEARNING_ADVISOR_* nếu muốn Cố vấn dùng cấu hình chung. `MAIHOC_LEARNING_ADVISOR_ENABLED=0` vẫn tắt Cố vấn. Chuỗi fallback model của solver chỉ được thử cho model không khả dụng hoặc lỗi tạm thời, không thử tiếp khi xác thực/quyền/quota sai.

## Các bước trên Render

1. Deploy bản sửa vào Web Service backend, mở **Shell** của service đó. Worker riêng cũng cần cùng biến môi trường và bản code nếu bật xử lý nền.
2. Tại thư mục gốc repo, chạy `npm run ai:check`. Nếu Root Directory là `server`, chạy `node check-ai.js`. Lệnh này chỉ kiểm tra cấu hình cục bộ, không gọi API và không khẳng định key còn dùng được.
3. Chạy `npm run ai:check -- --live` (hoặc `node check-ai.js --live`). Lệnh gọi ListModels bằng key hiện có để kiểm tra xác thực và khả năng generateContent của model đã chọn; không gửi dữ liệu học sinh.
4. Có thể xác minh thực tế bằng `npm run ai:check -- --generate` (hoặc `node check-ai.js --generate`). Lệnh gửi câu kiểm tra ngắn cho từng scope, tiêu thụ một lượng token nhỏ. Kết quả không in key hoặc phản hồi thô của Google.
5. Nếu báo lỗi, sửa Environment theo bảng dưới, lưu và redeploy Web Service/worker. Chạy lại `--live`, rồi `--generate`; sau đó thử Gia sư và hai Cố vấn bằng tài khoản phù hợp.

| Kết quả | Cách xử lý |
| --- | --- |
| CONFIGURED_NOT_VERIFIED | Chỉ hợp lệ về định dạng; cần chạy --live/--generate để xác minh |
| AI_KEY_MISSING / AI_KEY_FORMAT | Sao chép đầy đủ key từ Google AI Studio vào biến được chọn; bỏ khoảng trắng/xuống dòng bên trong |
| AI_AUTH_INVALID | Kiểm tra key còn hoạt động, đúng project và không bị thu hồi/rò rỉ; tạo key thay thế trong AI Studio nếu cần. Không dùng mật khẩu Google, OAuth access token hoặc key của dịch vụ khác |
| AI_PERMISSION_DENIED | Kiểm tra Generative Language API, API restrictions, application restrictions phù hợp backend và service account/project liên kết |
| AI_MODEL_MISSING / AI_MODEL_UNAVAILABLE | Chọn model có thật, được key/project cho phép và hỗ trợ generateContent; không suy đoán tên model |
| AI_QUOTA_EXHAUSTED | Kiểm tra quota, billing và hạn mức của project; đổi tên model không sửa được key không hợp lệ |
| AI_REQUEST_INVALID | Kiểm tra tham số/yêu cầu mà model hỗ trợ |
| AI_PROVIDER_UNAVAILABLE | Lỗi mạng/timeout/5xx; thử lại sau |
| AUTH_AND_MODEL_VERIFIED | ListModels thành công, chưa xác nhận một lượt tạo nội dung |
| GENERATE_VERIFIED | Tạo nội dung kiểm tra thành công ở thời điểm chạy |

Không gửi key qua chat hoặc đưa vào frontend/git. Chỉ cần chia sẻ đầu ra đã được lọc của lệnh kiểm tra nếu cần hỗ trợ tiếp. Không cần migration database cho bản sửa này.

## Giới hạn xác minh

Kiểm thử tự động dùng key giả và fetch giả lập. Không có quyền truy cập Environment/Render hoặc key production trong môi trường sửa mã, nên kết quả kiểm thử không xác nhận dịch vụ production đã được khôi phục.

## Tài liệu chính thức

- [Using Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key): chấp nhận standard và authorization keys; standard keys cần restrictions phù hợp.
- [Troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting): phân biệt lỗi xác thực, tham số, quota và lỗi tạm thời.
- [Models API](https://ai.google.dev/api/models): liệt kê model và supportedGenerationMethods.
