import {SAMPLE_DOCS} from "./data.js";
const STORAGE_KEY="maihoc-uploaded-docs";
export function getDocuments(){
  try{return [...SAMPLE_DOCS,...JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]")]}catch{return [...SAMPLE_DOCS]}
}
export async function uploadDocument(formData){
  const file=formData.get("document");
  if(!file||!file.name)throw new Error("Vui lòng chọn tệp tài liệu.");
  if(file.size>20*1024*1024)throw new Error("Tệp quá lớn. Giới hạn demo là 20 MB.");
  // Ưu tiên gửi lên server để lưu lâu dài. Nếu chưa bật server, lưu metadata + nội dung đọc được trong trình duyệt.
  try{
    const res=await fetch("/api/documents",{method:"POST",body:formData});
    if(res.ok)return await res.json();
    if(res.status!==404&&res.status!==405) {const j=await res.json().catch(()=>({}));throw new Error(j.error||"Không thể tải tệp lên máy chủ.");}
  }catch(err){if(err.message?.includes("Không thể tải"))throw err;}
  const textFile=/\.(txt|md|csv)$/i.test(file.name);
  const content=textFile?await file.text():"";
  const doc={id:"upload-"+Date.now(),subject:formData.get("subject"),grade:formData.get("grade"),category:formData.get("category"),title:formData.get("title")||file.name,description:`${file.name} · ${(file.size/1024).toFixed(0)} KB`,sample:false,content,filename:file.name,localOnly:true};
  const old=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");old.push(doc);localStorage.setItem(STORAGE_KEY,JSON.stringify(old));
  return {document:doc,localOnly:true};
}
