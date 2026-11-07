export function gradeSummary(items) {
 const groups = new Map();
 for (const row of items) {
   const p=row.payload,key=JSON.stringify([String(row.student_id),p.subject,p.term]);
   const g=groups.get(key)||{studentId:row.student_id,subject:p.subject,term:p.term,sum:0,weight:0,count:0};
   g.sum+=p.score*p.weight;g.weight+=p.weight;g.count++;groups.set(key,g);
 }
 return [...groups.values()].map(g=>{const average=Math.round(g.sum/g.weight*100)/100;return {studentId:g.studentId,subject:g.subject,term:g.term,count:g.count,average,classification:average>=8?'Tốt':average>=6.5?'Khá':average>=5?'Đạt':'Cần cố gắng'};});
}
