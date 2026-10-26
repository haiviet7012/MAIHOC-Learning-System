import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {GoogleGenerativeAI} from "@google/generative-ai";

dotenv.config();
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,"..");
const app=express();
const port=Number(process.env.PORT||3000);
const uploadsDir=path.join(root,"uploads");
fs.mkdirSync(uploadsDir,{recursive:true});
app.use(cors());
app.use(express.json({limit:"1mb"}));
app.use(express.static(root,{extensions:["html"]}));
const storage=multer.diskStorage({destination:(_req,_file,cb)=>cb(null,uploadsDir),filename:(_req,file,cb)=>{const safe=path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g,"_");cb(null,`${Date.now()}-${safe}`);}});
const upload=multer({storage,limits:{fileSize:20*1024*1024},fileFilter:(_req,file,cb)=>{const ext=path.extname(file.originalname).toLowerCase();const allowed=new Set([".pdf",".doc",".docx",".ppt",".pptx",".txt",".png",".jpg",".jpeg"]);cb(allowed.has(ext)?null:new Error("Định dạng tệp chưa được hỗ trợ."),allowed.has(ext));}});
app.post("/api/documents",upload.single("document"),(req,res)=>{
 if(!req.file)return res.status(400).json({error:"Chưa nhận được tệp."});
 const meta={id:`upload-${Date.now()}`,subject:req.body.subject,grade:req.body.grade,category:req.body.category,title:req.body.title||req.file.originalname,filename:req.file.filename,originalName:req.file.originalname,size:req.file.size,uploadedAt:new Date().toISOString()};
 const index=path.join(uploadsDir,"index.json");const docs=fs.existsSync(index)?JSON.parse(fs.readFileSync(index,"utf8")):[];docs.push(meta);fs.writeFileSync(index,JSON.stringify(docs,null,2));
 res.json({document:meta,localOnly:false});
});
app.get("/api/documents",(req,res)=>{const index=path.join(uploadsDir,"index.json");res.json(fs.existsSync(index)?JSON.parse(fs.readFileSync(index,"utf8")):[]);});
app.post("/api/ai/difficulty",async(req,res)=>{
 const key=process.env.GEMINI_API_KEY;
 if(!key)return res.status(503).json({error:"Chưa cấu hình GEMINI_API_KEY trong file server/.env."});
 const {text="",title="Đề thi"}=req.body||{};
 if(!String(text).trim())return res.status(400).json({error:"Đề thi chưa có nội dung văn bản để phân tích."});
 try{
  const genAI=new GoogleGenerativeAI(key);
  const model=genAI.getGenerativeModel({model:process.env.GEMINI_MODEL||"gemini-2.5-flash"});
  const prompt=`Bạn là trợ lý đánh giá độ khó đề thi Toán THPT. Hãy phân tích đề sau bằng tiếng Việt, không tự khẳng định đáp án nếu thiếu dữ liệu. Trả lời ngắn gọn theo cấu trúc: Mức độ tổng quát (dễ/trung bình/khó), phân tích theo kiến thức, độ phân hóa, thời gian ước lượng và lưu ý.\\nTên đề: ${title}\\nNội dung đề:\\n${String(text).slice(0,18000)}`;
  const result=await model.generateContent(prompt);
  res.json({analysis:result.response.text()});
 }catch(err){console.error("Gemini error:",err);res.status(502).json({error:"Gemini không thể xử lý yêu cầu lúc này. Hãy kiểm tra model, API key và quota."});}
});
app.use((err,_req,res,_next)=>{console.error(err.message);res.status(400).json({error:err.message||"Yêu cầu không hợp lệ."});});
app.listen(port,()=>console.log(`MAI HỌC đang chạy tại http://localhost:${port}`));
