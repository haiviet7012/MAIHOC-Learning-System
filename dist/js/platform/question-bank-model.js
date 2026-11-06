import { filterContentTimeline } from './content-filters.js';
import { questionFingerprint, uniqueQuestions } from './question-identity.js';
export { questionFingerprint, uniqueQuestions } from './question-identity.js';
export const LEVELS = { nb: 'Nhận biết', th: 'Thông hiểu', vd: 'Vận dụng', vdc: 'Vận dụng cao' };
export const TYPES = { multiple_choice: 'Trắc nghiệm 4 đáp án', true_false: 'Đúng/Sai 4 mệnh đề', short_answer: 'Trả lời ngắn', essay: 'Tự luận' };
export const SUBJECTS = ['Toán', 'Vật lý', 'Hóa học', 'Tiếng Anh', 'Ngữ văn', 'Sinh học'];
export const GRADES = ['6', '7', '8', '9', '10', '11', '12', 'THPT', 'IELTS'];
const clone = value => JSON.parse(JSON.stringify(value));

export function seedQuestions(userId = 'demo') {
  const common = { status: 'approved', bank: 'school', owner: 'school', author: 'Nguyễn Minh Anh', reviewer: 'Tổ Toán', uses: 12, attempts: 320, rate: 64, ai: false, createdAt: '2026-11-01' };
  const rows = [
    { id: 'MATH12-089', subject: 'Toán', grade: '12', topic: 'Hàm số', type: 'true_false', level: 'th', stem: 'Cho hàm số $f(x) = x^3 - 3x + 2$. Xét tính đúng, sai của các mệnh đề sau:', choices: ["Đạo hàm của hàm số là $f′(x) = 3x^2 - 3$.", 'Hàm số đồng biến trên khoảng $(-1; 1)$.', 'Hàm số đạt cực tiểu tại $x = 1$.', 'Giá trị cực đại của hàm số bằng $4$.'], answer: [true, false, true, true], solution: '$f′(x) = 3(x-1)(x+1)$. Đạo hàm âm trên $(-1;1)$, dương bên ngoài. Hàm số đạt cực đại tại $x=-1$, $f(-1)=4$; cực tiểu tại $x=1$, $f(1)=0$.\nHướng dẫn chấm: đúng 1 / 2 / 3 / 4 ý lần lượt được 0,1 / 0,25 / 0,5 / 1 điểm.' },
    { id: 'MATH12-124', subject: 'Toán', grade: '12', topic: 'Nguyên hàm', type: 'multiple_choice', level: 'nb', stem: 'Họ tất cả các nguyên hàm của hàm số $f(x)=2x$ trên $ℝ$ là:', choices: ['$x^2 + C$', '$2x^2 + C$', '$x + C$', '$2 + C$'], answer: 0, solution: 'Vì $(x^2)′=2x$ nên $∫2x\,dx=x^2+C$. Chọn A.\nChấm điểm: chọn đúng được toàn bộ điểm của câu.', rate: 20, attempts: 185, owner: userId },
    { id: 'PHYS12-042', subject: 'Vật lý', grade: '12', topic: 'Dao động điều hòa', type: 'short_answer', level: 'vd', stem: 'Một vật dao động điều hòa có biên độ $A=5$ cm, tần số góc $ω=4$ rad/s. Tốc độ cực đại của vật bằng bao nhiêu cm/s?', choices: [], answer: '20', solution: 'Tốc độ cực đại $v_{max}=ωA=4×5=20$ cm/s.\nHướng dẫn chấm: đáp số 20 (cm/s) được toàn bộ điểm.', author: 'Trần Đức Huy', reviewer: 'Tổ Vật lý', rate: 58, attempts: 206 },
    { id: 'ENG-IELTS-018', subject: 'Tiếng Anh', grade: 'IELTS', topic: 'Reading · Environment', type: 'multiple_choice', level: 'th', stem: 'Read the sentence: “Urban green spaces mitigate the effects of air pollution.” The word “mitigate” is closest in meaning to:', choices: ['Intensify', 'Reduce', 'Ignore', 'Measure'], answer: 1, solution: '“Mitigate” means to make something less severe or harmful. “Reduce” is the closest synonym. Answer: B.\nChấm điểm: đáp án B được toàn bộ điểm.', author: 'Lê Thảo Vy', reviewer: 'Tổ Ngoại ngữ', rate: 76, attempts: 148 },
    { id: 'MATH12-156', subject: 'Toán', grade: '12', topic: 'Hàm số', type: 'essay', level: 'vdc', stem: 'Tìm tất cả các giá trị thực của tham số $m$ để phương trình $x^3-3x=m$ có ba nghiệm thực phân biệt.', choices: [], answer: '$-2<m<2$', solution: 'Xét $g(x)=x^3-3x$. Ta có $g′(x)=3(x^2-1)$; cực đại $g(-1)=2$, cực tiểu $g(1)=-2$. Đường thẳng $y=m$ cắt đồ thị tại ba điểm phân biệt khi $-2<m<2$.\nHướng dẫn chấm: đạo hàm 0,25; xét cực trị 0,25; lập luận số giao điểm 0,25; kết luận 0,25.', owner: userId, rate: 32, attempts: 94 },
    { id: 'PHYS11-063', subject: 'Vật lý', grade: '11', topic: 'Điện trường', type: 'true_false', level: 'nb', stem: 'Trong điện trường đều, xét các phát biểu sau:', choices: ['Các đường sức điện song song và cách đều nhau.', 'Vectơ cường độ điện trường có cùng phương tại mọi điểm.', 'Điện trường không tác dụng lực lên điện tích.', 'Lực điện tác dụng lên điện tích $q$ là $\\vec F=q\\vec E$.'], answer: [true, true, false, true], solution: 'Điện trường đều có vectơ cường độ điện trường không đổi. Lực điện tuân theo $\\vec F=q\\vec E$, nên phát biểu c sai.\nChấm điểm 4 ý: 0,1 / 0,25 / 0,5 / 1 điểm tương ứng 1 / 2 / 3 / 4 ý đúng.', author: 'Trần Đức Huy', reviewer: 'Tổ Vật lý', rate: 88, attempts: 230 },
    { id: 'ENG12-071', subject: 'Tiếng Anh', grade: '12', topic: 'Writing · Education', type: 'essay', level: 'vd', stem: 'Write a paragraph (120–150 words) about the benefits of self-directed learning. Include at least two examples.', choices: [], answer: 'Rubric: Task achievement 40%; coherence 20%; vocabulary 20%; grammar 20%.', solution: 'Gợi ý cấu trúc: mở đoạn giới thiệu học tập tự chủ; phát triển ý về quản lý thời gian và tư duy độc lập; đưa hai ví dụ cụ thể; kết đoạn.\nChấm theo rubric: đáp ứng đề 40%, mạch lạc 20%, từ vựng 20%, ngữ pháp 20%. Không có một đáp án văn bản duy nhất.', bank: 'pro', author: 'Lê Thảo Vy', reviewer: 'Hội đồng MAIHOC', rate: 61, attempts: 80 },
    { id: 'MATH10-032', subject: 'Toán', grade: '10', topic: 'Hàm số bậc hai', type: 'multiple_choice', level: 'nb', stem: 'Hoành độ đỉnh của parabol $y=x^2-4x+3$ là:', choices: ['$-2$', '$2$', '$4$', '$-4$'], answer: 1, solution: 'Hoành độ đỉnh $x=-b/(2a)=4/2=2$. Chọn B.', bank: 'pro', rate: 91, attempts: 407 },
  ].map(q => ({ ...common, ...q }));
  const pending = rows.map((q, i) => ({ ...clone(q), id: `REVIEW-${String(i + 1).padStart(3, '0')}`, status: 'draft', bank: 'school', owner: `teacher-${i}`, reviewer: '', attempts: 0, rate: null, uses: 0 }));
  return [...rows, ...pending];
}

export function normalizeSearch(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}
export function filterQuestions(rows, filters, userId) {
  return filterContentTimeline(uniqueQuestions(rows.filter(q => {
    const tab = filters.tab || 'school';
    const inTab = tab === 'personal' ? String(q.owner) === String(userId) : tab === 'pending' ? q.status === 'draft' && q.bank === 'school' : q.status === 'approved' && q.bank === tab;
    return inTab && (!filters.search || normalizeSearch([q.id, q.stem, q.topic, ...q.choices].join(' ')).includes(normalizeSearch(filters.search))) &&
      ['subject', 'grade', 'type', 'level'].every(key => !filters[key] || String(q[key]) === filters[key]);
  })), filters);
}
export function needsReview(q) { return q.level === 'nb' && q.attempts > 0 && q.rate < 40; }
export function validateQuestion(q) {
  if (!SUBJECTS.includes(q.subject) || !GRADES.includes(String(q.grade)) || !LEVELS[q.level] || !TYPES[q.type]) throw new Error('Vui lòng chọn đầy đủ môn, khối, dạng câu và mức độ.');
  if (!q.stem?.trim() || !q.topic?.trim()) throw new Error('Vui lòng nhập nội dung và chuyên đề.');
  if (['multiple_choice', 'true_false'].includes(q.type) && (q.choices?.length !== 4 || q.choices.some(x => !x.trim()))) throw new Error('Vui lòng nhập đủ 4 phương án hoặc mệnh đề.');
  if (q.type === 'multiple_choice' && (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3)) throw new Error('Vui lòng chọn đáp án đúng.');
  if (q.type === 'true_false' && (q.answer?.length !== 4 || q.answer.some(x => typeof x !== 'boolean'))) throw new Error('Vui lòng xác định Đúng/Sai cho cả 4 ý.');
  if (['essay', 'short_answer'].includes(q.type) && !String(q.answer || '').trim()) throw new Error('Vui lòng nhập đáp số hoặc hướng dẫn chấm.');
  return q;
}
export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function extractMatrix(rows, spec) {
  const pool = uniqueQuestions(rows.filter(q => q.status === 'approved' && q.subject === spec.subject && String(q.grade) === spec.grade && (!spec.topic || q.topic === spec.topic)));
  const picked = [];
  for (const key of Object.keys(LEVELS)) {
    const count = Number(spec.counts[key]);
    if (!Number.isInteger(count) || count < 0 || count > 100) throw new Error('Số câu mỗi mức độ phải là số nguyên từ 0 đến 100.');
    const candidates = pool.filter(q => q.level === key);
    if (count > candidates.length) throw new Error(`${LEVELS[key]}: cần ${count} câu, hiện có ${candidates.length}. Hãy điều chỉnh ma trận hoặc bổ sung câu hỏi.`);
    picked.push(...shuffle(candidates).slice(0, count));
  }
  if (!picked.length) throw new Error('Hãy chọn ít nhất 1 câu hỏi trong ma trận.');
  return picked;
}
export function buildExam(rows, { title = 'Đề kiểm tra từ Ngân hàng câu hỏi', codes = 2 } = {}) {
  rows = uniqueQuestions(rows);
  if (!rows.length) throw new Error('Giỏ đề đang trống.');
  if (!Number.isInteger(Number(codes)) || codes < 1 || codes > 20) throw new Error('Số mã đề phải từ 1 đến 20.');
  if (rows.some(q => q.status !== 'approved')) throw new Error('Chỉ sử dụng câu hỏi đã được duyệt.');
  if (new Set(rows.map(q => `${q.subject}:${q.grade}`)).size !== 1) throw new Error('Một đề kiểm tra cần cùng môn và khối lớp. Hãy điều chỉnh giỏ đề.');
  const variants = Array.from({ length: Number(codes) }, (_, i) => ({ code: String(101 + i), questions: shuffle(rows).map(q => {
    const copy = clone(q);
    if (q.type === 'multiple_choice') {
      const order = shuffle([0, 1, 2, 3]);
      copy.choices = order.map(j => q.choices[j]); copy.answer = order.indexOf(q.answer);
      copy.solution = String(copy.solution || '').replace(/(Chọn|Answer:|đáp án)\s+[A-D]\b/gi, (_, prefix) => `${prefix} ${'ABCD'[copy.answer]}`);
    }
    // Integer hundredths keep the sum exactly 10, including 3/6/7-question exams.
    const index = rows.indexOf(q), base = Math.floor(1000 / rows.length);
    return { ...copy, points: (base + (index < 1000 % rows.length ? 1 : 0)) / 100 };
  }) }));
  return { version: 1, title, subject: rows[0].subject, grade: rows[0].grade, source: 'question-bank-demo', createdAt: new Date().toISOString(), totalPoints: 10, variants };
}

export function generateVariants(original, existing = []) {
  return uniqueQuestions([2, 3].map((n, i) => {
    const q = { ...clone(original), id: `AI-${globalThis.crypto.randomUUID()}`, status: 'draft', completed: false, lastCompletedAt: null, ai: true, attempts: 0, rate: null, uses: 0, bank: 'school', reviewer: '', createdAt: new Date().toISOString() };
    const math = original.subject === 'Toán', physics = original.subject === 'Vật lý';
    if (math || physics) {
      const answer = math ? n * n : n * 10;
      q.topic = math ? 'Hàm số' : 'Chuyển động thẳng';
      const intro = math ? `Cho hàm số $f(x)=${n}x^2$.` : `Một xe chuyển động thẳng đều với tốc độ ${n} m/s trong 10 giây.`;
      const target = math ? `Giá trị $f′(${n / 2})$ bằng bao nhiêu?` : 'Quãng đường xe đi được bằng bao nhiêu mét?';
      q.stem = `${intro} ${target}`;
      q.choices = [String(answer), String(answer + n), String(answer - n), String(answer * 2)]; q.answer = 0;
      q.solution = math ? `$f′(x)=${2 * n}x$ nên $f′(${n / 2})=${answer}$.` : `$s=vt=${n}×10=${answer}$ m.`;
      if (q.type === 'true_false') {
        q.stem = `${intro} Xét các mệnh đề sau:`;
        q.choices = math ? [`$f(0)=0$.`, `$f′(x)=${2 * n}x$.`, `$f′(1)=${n}$.`, `$f(1)=${n}$.`] : ['Xe có tốc độ không đổi.', `Quãng đường sau 10 giây là ${answer} m.`, `Sau 5 giây xe đi được ${answer} m.`, `Sau 1 giây xe đi được ${n} m.`];
        q.answer = [true, true, false, true];
        q.solution = math ? `$f(0)=0$, $f′(x)=${2 * n}x$, $f′(1)=${2 * n}$ và $f(1)=${n}$. Đáp án: Đúng, Đúng, Sai, Đúng.` : `$s=vt$. Sau 10 giây: ${answer} m; sau 5 giây: ${n * 5} m; sau 1 giây: ${n} m. Đáp án: Đúng, Đúng, Sai, Đúng.`;
      } else if (['short_answer', 'essay'].includes(q.type)) { q.choices = []; q.answer = String(answer); if (q.type === 'essay') q.solution += '\nChấm: công thức 0,5 điểm, thay số và kết quả 0,5 điểm (quy đổi theo điểm câu).'; }
    } else if (original.subject === 'Tiếng Anh') {
      const words = i ? ['crucial', 'essential', 'optional', 'ordinary', 'temporary'] : ['diminish', 'decrease', 'increase', 'maintain', 'ignore'];
      q.topic = 'Vocabulary · Academic English';
      q.stem = `The word “${words[0]}” is closest in meaning to:`; q.choices = words.slice(1); q.answer = 0;
      q.solution = `“${words[0]}” means “${words[1]}”. Chọn phương án mang nghĩa “${words[1]}”.`;
      if (q.type === 'essay') { q.stem = `Write a paragraph (120–150 words) about the benefits of ${i ? 'collaborative learning' : 'reading books'}. Give two examples.`; q.choices = []; q.answer = 'Task achievement 40%; coherence 20%; vocabulary 20%; grammar 20%.'; q.solution = 'Nêu quan điểm, giải thích hai lợi ích kèm ví dụ và kết luận. Chấm theo rubric 40/20/20/20; giáo viên đánh giá nội dung cụ thể.'; }
      else if (q.type === 'short_answer') { q.answer = words[1]; q.choices = []; }
      else if (q.type === 'true_false') { q.stem = `Consider the word “${words[0]}”. Mark each statement True or False.`; q.choices = [`It is similar in meaning to “${words[1]}”.`, `It means “${words[2]}”.`, `It means “${words[3]}”.`, `It means “${words[4]}”.`]; q.answer = [true, false, false, false]; }
    } else throw new Error('Mô phỏng biến thể hiện hỗ trợ Toán, Vật lý và Tiếng Anh. Có thể kết nối dịch vụ AI qua adapter.');
    return validateQuestion(q);
  }), [original, ...existing]);
}

// Repository contract: list(), save(question), approve(id), remove(id). Replace this adapter to use authenticated APIs.
export function createLocalRepository(userId, storage = globalThis.localStorage) {
  const key = `maihoc:question-bank:v1:${userId}`;
  let questions;
  try { const saved = JSON.parse(storage?.getItem(key) || 'null'); questions = Array.isArray(saved) && saved.every(q => { try { validateQuestion(q); return typeof q.id === 'string' && Array.isArray(q.choices); } catch { return false; } }) ? saved : seedQuestions(userId); }
  catch { questions = seedQuestions(userId); }
  const persist = () => { try { storage?.setItem(key, JSON.stringify(questions)); return true; } catch { return false; } };
  return {
    list: () => clone(questions),
    save(q) { validateQuestion(q); if (questions.some(x => x.id !== q.id && questionFingerprint(x) === questionFingerprint(q))) throw new Error('Câu hỏi đã có trong kho (trùng nội dung và phương án).'); const index = questions.findIndex(x => x.id === q.id); if (index >= 0) questions[index] = clone(q); else questions.unshift(clone(q)); return persist(); },
    remove(id) { const index = questions.findIndex(q => q.id === id); if (index < 0) throw new Error('Không tìm thấy câu hỏi.'); questions.splice(index, 1); return persist(); },
    approve(id) { const q = questions.find(x => x.id === id); if (!q) throw new Error('Không tìm thấy câu hỏi.'); q.status = 'approved'; q.reviewer = 'Tổ chuyên môn (mô phỏng)'; return persist(); },
  };
}
