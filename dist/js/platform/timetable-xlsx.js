// Excel is loaded only when importing/exporting, from our own deployment.
export const subjects = ['Toán', 'Ngữ văn', 'Tiếng Anh', 'Vật lý', 'Hóa học', 'Sinh học', 'Lịch sử', 'Địa lý', 'Tin học', 'Giáo dục kinh tế và pháp luật', 'Công nghệ', 'IELTS', 'Tự học'];
export const days = ['Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy', 'Chủ nhật'];
export const sessions = [{ name: 'Sáng', count: 5, start: 0 }, { name: 'Chiều', count: 4, start: 5 }];
const colours = ['F8DCD6', 'F6EDC7', 'D6EEE7', 'E7DDF3', 'DAE8F6'];
const normal = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').trim().replace(/\s+/g, ' ');
const aliases = new Map(subjects.map(s => [normal(s), s]));
for (const [alias, subject] of Object.entries({ van: 'Ngữ văn', 'ngu van': 'Ngữ văn', anh: 'Tiếng Anh', 'anh van': 'Tiếng Anh', ly: 'Vật lý', hoa: 'Hóa học', sinh: 'Sinh học', su: 'Lịch sử', dia: 'Địa lý', tin: 'Tin học', gdktpl: 'Giáo dục kinh tế và pháp luật', toan: 'Toán' })) aliases.set(alias, subject);
function text(cell) {
  const value = cell.value;
  if (value == null) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if ('formula' in value || 'sharedFormula' in value) throw new Error(`Ô ${cell.address}: hãy thay công thức bằng giá trị trước khi nhập.`);
    if (value.richText) return value.richText.map(part => part.text).join('').trim();
    throw new Error(`Ô ${cell.address}: giá trị không được hỗ trợ.`);
  }
  return String(value).trim();
}
function dayIndex(value) {
  if (value instanceof Date) return (value.getUTCDay() + 6) % 7;
  const n = normal(value).split(/\n/)[0].trim();
  const index = days.findIndex(d => normal(d) === n);
  if (index >= 0) return index;
  if (/^(thu\s*)?[2-7]$/.test(n)) return Number(n.match(/[2-7]/)[0]) - 2;
  if (['cn', 'chu nhat', 'sunday'].includes(n)) return 6;
  return -1;
}
function sessionIndex(value) {
  const n = normal(value);
  return ['sang', 'buoi sang', 'am'].includes(n) ? 0 : ['chieu', 'buoi chieu', 'pm'].includes(n) ? 1 : -1;
}
function periodIndex(value, session) {
  const match = /^(?:tiet\s*)?([1-5])$/.exec(normal(value));
  if (!match || session < 0 || Number(match[1]) > sessions[session].count) return -1;
  return sessions[session].start + Number(match[1]) - 1;
}

export function parseTimetableWorkbook(workbook) {
  const sheets = [...workbook.worksheets].sort((a, b) => Number(b.name === 'Thời khóa biểu') - Number(a.name === 'Thời khóa biểu'));
  for (const sheet of sheets) {
    if (sheet.state && sheet.state !== 'visible') continue;
    if (sheet.rowCount > 2000 || sheet.columnCount > 50) throw new Error('Bảng quá lớn. Chỉ nhập bảng tối đa 2.000 dòng và 50 cột.');
    for (let row = 1; row <= Math.min(sheet.rowCount, 30); row++) {
      const headers = Array.from({ length: sheet.columnCount }, (_, i) => text(sheet.getCell(row, i + 1)));
      const names = headers.map(normal);
      const sessionCol = names.findIndex(n => ['buoi', 'ca'].includes(n)) + 1;
      const periodCol = names.findIndex(n => n === 'tiet') + 1;
      const subjectCol = names.findIndex(n => ['mon', 'mon hoc'].includes(n)) + 1;
      const dayCol = names.findIndex(n => ['thu', 'ngay', 'ngay hoc'].includes(n)) + 1;
      const dayCols = headers.map((h, i) => ({ day: dayIndex(h), col: i + 1 })).filter(h => h.day >= 0);
      if (!sessionCol || !periodCol || (!(subjectCol && dayCol) && dayCols.length < 2)) continue;
      if (!(subjectCol && dayCol) && headers.some(h => /^thu\s/.test(normal(h)) && dayIndex(h) < 0)) throw new Error('Bảng có cột thứ không hợp lệ. Chỉ dùng Thứ hai đến Chủ nhật.');
      if (new Set(dayCols.map(h => h.day)).size !== dayCols.length) throw new Error('Bảng có cột thứ bị trùng.');
      const cells = {}, occupied = new Set();
      const put = (slot, day, value, address) => {
        if (slot < 0 || day < 0) throw new Error(`Ô ${address}: thứ, buổi hoặc tiết không hợp lệ (sáng 1–5, chiều 1–4).`);
        const key = `${slot}-${day}`;
        if (occupied.has(key)) throw new Error(`Ô ${address}: trùng thứ, buổi và tiết với ô khác.`);
        occupied.add(key);
        if (value === '' || value === '—' || value === '-') return;
        const subject = aliases.get(normal(value));
        if (!subject) throw new Error(`Ô ${address}: môn “${String(value).slice(0, 80)}” chưa được hỗ trợ. Xem danh sách môn trên web.`);
        cells[key] = subject;
      };
      let previousSession = -1;
      for (let r = row + 1; r <= sheet.rowCount; r++) {
        const get = col => text(sheet.getCell(r, col));
        const sessionValue = get(sessionCol), periodValue = get(periodCol);
        const relevant = subjectCol && dayCol ? [get(dayCol), get(subjectCol)] : dayCols.map(h => get(h.col));
        if (![sessionValue, periodValue, ...relevant].some(v => v !== '')) continue;
        const session = sessionValue === '' ? previousSession : sessionIndex(sessionValue);
        previousSession = session;
        const slot = periodIndex(periodValue, session);
        if (subjectCol && dayCol) put(slot, dayIndex(get(dayCol)), get(subjectCol), sheet.getCell(r, subjectCol).address);
        else for (const h of dayCols) put(slot, h.day, get(h.col), sheet.getCell(r, h.col).address);
      }
      return { cells, sheetName: sheet.name };
    }
  }
  throw new Error('Không tìm thấy thời khóa biểu. Dùng bảng lưới Buổi | Tiết | Thứ hai … Chủ nhật, hoặc danh sách Thứ | Buổi | Tiết | Môn học. Bạn có thể xuất lịch trống để lấy mẫu.');
}

export function createTimetableWorkbook(ExcelJS, cells, now = new Date()) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MAIHOC'; workbook.created = now;
  const stamp = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now);
  const sheet = workbook.addWorksheet('Thời khóa biểu', { views: [{ state: 'frozen', xSplit: 2, ySplit: 5 }], pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1 } });
  sheet.columns = [{ width: 12 }, { width: 9 }, ...days.map(() => ({ width: 24 }))];
  sheet.mergeCells('A1:I1'); sheet.getCell('A1').value = 'MAIHOC · THỜI KHÓA BIỂU';
  sheet.mergeCells('A2:I2'); sheet.getCell('A2').value = `Ngày xuất: ${stamp} (giờ Việt Nam, UTC+7)`;
  sheet.mergeCells('A3:I3'); sheet.getCell('A3').value = 'Lịch lặp hằng tuần · Sáng: tiết 1–5 · Chiều: tiết 1–4 · Màu môn khớp với website';
  sheet.addRow([]); sheet.getRow(5).values = ['Buổi', 'Tiết', ...days];
  const detail = workbook.addWorksheet('Chi tiết');
  detail.columns = [{ header: 'Thứ', width: 18 }, { header: 'Buổi', width: 12 }, { header: 'Tiết', width: 9 }, { header: 'Môn học', width: 40 }];
  for (const session of sessions) {
    const first = 6 + session.start;
    sheet.mergeCells(first, 1, first + session.count - 1, 1);
    sheet.getCell(first, 1).value = session.name;
    for (let p = 0; p < session.count; p++) {
      const r = first + p;
      sheet.getCell(r, 2).value = p + 1; sheet.getRow(r).height = 54;
      for (let d = 0; d < 7; d++) {
        const subject = cells[`${session.start + p}-${d}`] || '';
        const cell = sheet.getCell(r, d + 3); cell.value = subject;
        if (subject) {
          const argb = 'FF' + colours[subjects.indexOf(subject) % colours.length];
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
          const record = detail.addRow([days[d], session.name, p + 1, subject]);
          record.getCell(4).fill = cell.fill;
        }
      }
    }
  }
  for (const ws of [sheet, detail]) ws.eachRow(row => row.eachCell({ includeEmpty: true }, cell => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF172B50' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = Object.fromEntries(['top', 'left', 'bottom', 'right'].map(side => [side, { style: 'thin', color: { argb: 'FFD4DCE7' } }]));
  }));
  for (const [ws, row] of [[sheet, 5], [detail, 1]]) ws.getRow(row).eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF172B50' } };
    cell.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' } };
  });
  sheet.getRow(1).height = 34; sheet.getRow(2).height = 26; sheet.getRow(3).height = 32; sheet.getRow(5).height = 28;
  sheet.getCell('A1').font = { name: 'Calibri', size: 20, bold: true, color: { argb: 'FF172B50' } };
  sheet.pageSetup.printArea = 'A1:I14';
  const help = workbook.addWorksheet('Hướng dẫn');
  help.getColumn(1).width = 115;
  for (const line of ['CÁCH NHẬP LẠI VÀO MAIHOC', 'Bảng lưới: Buổi | Tiết | Thứ hai | Thứ ba | Thứ tư | Thứ năm | Thứ sáu | Thứ bảy | Chủ nhật.', 'Hoặc bảng danh sách: Thứ | Buổi | Tiết | Môn học. Đặt trong sheet đầu tiên hoặc đặt tên sheet “Thời khóa biểu”.', 'Sáng: tiết 1–5. Chiều: tiết 1–4. Thứ có thể viết Thứ 2 … Thứ 7, CN hoặc dùng ô ngày Excel.', 'Chỉ nhập các môn được hỗ trợ. Môn viết không dấu hoặc tên tắt thông dụng được chuẩn hóa tự động.', 'Lịch nhập thay thế các ô hiện tại sau khi xác nhận; nhấn Lưu để lưu vào tài khoản.', 'Ngày xuất là ngày tạo file, không phải ngày bắt đầu tuần. Lịch trên web là lịch lặp hằng tuần.', 'Công thức, tiết/thứ trùng, môn lạ hoặc ô ngoài phạm vi sẽ báo lỗi; lịch hiện tại được giữ nguyên.', `Môn hỗ trợ: ${subjects.join(', ')}.`]) { const r = help.addRow([line]); r.height = 36; r.alignment = { wrapText: true, vertical: 'middle' }; }
  return workbook;
}
let excelPromise;
export function loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (!excelPromise) excelPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = '/vendor/exceljs/exceljs.min.js';
    script.onload = () => window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('Không khởi tạo được bộ đọc Excel.'));
    script.onerror = () => { script.remove(); reject(new Error('Không tải được bộ đọc Excel. Hãy thử lại.')); };
    document.head.append(script);
  }).catch(error => { excelPromise = null; throw error; });
  return excelPromise;
}
