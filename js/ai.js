// Gemini được gọi qua backend để API key không xuất hiện trong trình duyệt.
export async function evaluateDifficulty(documentText,title="Đề thi"){
  const response=await fetch("/api/ai/difficulty",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:documentText,title})});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||"Không gọi được dịch vụ AI. Hãy chạy backend và cấu hình GEMINI_API_KEY.");}
  return response.json();
}
