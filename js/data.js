export const SUBJECT_CATALOG = [
  {
    "id": "toan",
    "name": "Toán",
    "icon": "∑",
    "enabled": true,
    "grades": [
      "10",
      "11",
      "12"
    ],
    "assessmentProfile": "Toán"
  },
  {
    "id": "vat-ly",
    "name": "Vật lý",
    "icon": "⚛",
    "enabled": true,
    "grades": [
      "10",
      "11",
      "12"
    ],
    "assessmentProfile": "Vật lý"
  },
  {
    "id": "hoa-hoc",
    "name": "Hóa học",
    "icon": "⚗",
    "enabled": true,
    "grades": [
      "10",
      "11",
      "12"
    ],
    "assessmentProfile": "Hóa học"
  },
  {
    "id": "sinh-hoc",
    "name": "Sinh học",
    "icon": "❧",
    "enabled": true,
    "grades": [
      "10",
      "11",
      "12"
    ],
    "assessmentProfile": "Sinh học"
  },
  {
    "id": "tieng-anh",
    "name": "Tiếng Anh",
    "icon": "A",
    "enabled": true,
    "grades": [
      "10",
      "11",
      "12"
    ],
    "assessmentProfile": "Tiếng Anh"
  },
  {
    "id": "ngu-van",
    "name": "Ngữ văn",
    "icon": "文",
    "enabled": false,
    "grades": [
      "10",
      "11",
      "12"
    ],
    "assessmentProfile": "Ngữ văn"
  },
  {
    "id": "ielts",
    "name": "IELTS",
    "icon": "✦",
    "enabled": false,
    "grades": [],
    "assessmentProfile": "IELTS"
  },
  {
    "id": "de-thi-thpt-quoc-gia",
    "name": "Đề thi THPT quốc gia",
    "icon": "▤",
    "enabled": false,
    "grades": [
      "12"
    ],
    "assessmentProfile": null,
    "kind": "exam-collection"
  }
];
export const SUBJECTS = SUBJECT_CATALOG.map(subject => subject.name);
export const ENABLED_SUBJECTS = SUBJECT_CATALOG.filter(subject => subject.enabled).map(subject => subject.name);
export const getSubjectConfig = name => SUBJECT_CATALOG.find(subject => subject.name === name || subject.id === name) || null;
export const CATEGORIES = {
  theory: {label:"Ôn tập lý thuyết", icon:"▤"},
  practice: {label:"Đề thi ôn tập", icon:"✎"},
  exam: {label:"Phòng thi thử", icon:"◷"},
  exercise: {label:"Bài tập tổng hợp", icon:"∑"},
  answer: {label:"Đáp án / lời giải", icon:"✓"}
};
export const SAMPLE_DOCS = [
  {id:"sample-theory-10",subject:"Toán",grade:"10",category:"theory",title:"Tóm tắt kiến thức Toán 10",description:"Tập hợp, hàm số, vectơ và các kiến thức nền tảng.",sample:true,content:"TÓM TẮT KIẾN THỨC TOÁN 10\n\n1. Mệnh đề và tập hợp\n- Mệnh đề là câu khẳng định có tính đúng hoặc sai.\n- Các phép toán tập hợp: hợp, giao, hiệu, phần bù.\n\n2. Hàm số\n- Tập xác định là tập hợp các giá trị x để biểu thức có nghĩa.\n- Hàm số bậc hai y=ax²+bx+c (a ≠ 0) có đồ thị là parabol.\n\n3. Vectơ\n- Hai vectơ bằng nhau khi cùng hướng và cùng độ dài.\n- Quy tắc hình bình hành: u+v là đường chéo hình bình hành dựng trên u và v."},
  {id:"sample-practice-10",subject:"Toán",grade:"10",category:"practice",title:"Đề ôn tập Toán 10 — Bộ 01",description:"Bộ câu hỏi mẫu để làm quen với phòng luyện tập.",sample:true,content:"ĐỀ ÔN TẬP TOÁN 10 — BỘ 01\n\nCâu 1. Tìm tập xác định của hàm số y = √(x - 2).\nCâu 2. Tìm đỉnh của parabol y = x² - 4x + 1.\nCâu 3. Cho hai vectơ a=(1,2), b=(3,-1). Tính a+b.\nCâu 4. Giải phương trình x² - 5x + 6 = 0."},
  {id:"sample-exam-10",subject:"Toán",grade:"10",category:"exam",title:"Đề thi thử Toán 10 — Bộ 01",description:"Thời gian 90 phút · 4 câu mẫu · Có thể thực hành nộp bài.",sample:true,content:"ĐỀ THI THỬ TOÁN 10 — BỘ 01\n\nThời gian làm bài: 90 phút.\n\nCâu 1. Tập xác định của hàm số y = √(2x - 6) là gì?\nCâu 2. Tìm tọa độ đỉnh của parabol y = x² - 6x + 5.\nCâu 3. Giải phương trình x² - 7x + 12 = 0.\nCâu 4. Cho A(1,2), B(4,6). Tính độ dài AB."}
];
