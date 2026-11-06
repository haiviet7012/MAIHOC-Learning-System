export function schoolYearOptions(now = new Date()) {
 const year=Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Ho_Chi_Minh'}).format(now));
 return Array.from({length:4},(_,i)=>{const start=year-1+i;return {start,code:`${start} - ${start+1}`};});
}

export function schoolYearPayload(code) {
 const match=/^(\d{4})\s*-\s*(\d{4})$/.exec(String(code??'').trim());
 if(!match||Number(match[2])!==Number(match[1])+1)throw new Error('Năm học phải gồm hai năm liên tiếp, ví dụ 2026 - 2027.');
 return {code:`${match[1]} - ${match[2]}`,startDate:`${match[1]}-09-05`,endDate:`${match[2]}-06-30`};
}

export function normalizeSchoolYearCode(code) {
 return String(code ?? '').trim().replace(/[–—−]/g,'-').replace(/\s/g,'');
}
