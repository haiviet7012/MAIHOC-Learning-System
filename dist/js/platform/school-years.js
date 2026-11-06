export function schoolYearOptions(now = new Date()) {
 const year=Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Ho_Chi_Minh'}).format(now));
 return Array.from({length:4},(_,i)=>{const start=year-1+i;return {start,code:`${start} - ${start+1}`};});
}
