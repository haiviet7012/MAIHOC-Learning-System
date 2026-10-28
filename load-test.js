import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },  // Tăng dần lên 50 users trong 30s
    { duration: '1m',  target: 200 }, // Tăng lên 200 users và giữ trong 1 phút
    { duration: '1m',  target: 350 }, // Đẩy lên 350 users (mốc mục tiêu)
    { duration: '20s', target: 0 },   // Hạ tải
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],   // Tỷ lệ lỗi HTTP phải dưới 1%
    http_req_duration: ['p(95)<500'], // 95% request phải phản hồi nhanh hơn 500ms
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // 1. Giả lập người dùng mở trang & trình duyệt kiểm tra ETag của file tĩnh
  const resHome = http.get(`${BASE_URL}/`);
  check(resHome, { 'home status 200': (r) => r.status === 200 });

  // 2. Giả lập chu kỳ hoạt động của học sinh (đọc tài liệu / kiểm tra phiên)
  const resJs = http.get(`${BASE_URL}/js/app.js`, {
    headers: { 'If-None-Match': resHome.headers['ETag'] || '' },
  });
  check(resJs, { 'static asset ok': (r) => r.status === 200 || r.status === 304 });

  // Nghỉ ngẫu nhiên từ 3 đến 6 giây giống hành vi người thật đọc nội dung trên trang
  sleep(Math.random() * 3 + 3);
}