import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {GoogleGenerativeAI} from "@google/generative-ai";
import {
  db, publicUser, registerUser, authenticateUser, createSession, destroySession,
  loadCurrentUser, requireAdmin, requireSameOrigin, createInitialAdmin
} from "./auth.js";

dotenv.config();
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,"..");
const app=express();
const port=Number(process.env.PORT||3000);
const uploadsDir=path.join(root,"uploads");
fs.mkdirSync(uploadsDir,{recursive:true});

app.disable("x-powered-by");
app.use((req,res,next)=>{
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options","DENY");
  next();
});
app.use(express.json({limit:"1mb"}));
app.use(loadCurrentUser);
// Do not expose backend source, environment files or the local account database as static assets.
app.use((req,res,next)=>req.path==="/server"||req.path.startsWith("/server/")?res.sendStatus(404):next());
app.use(express.static(root,{extensions:["html"],index:"index.html"}));

const loginAttempts=new Map();
function loginRateLimit(req,res,next){
  const key=`${req.ip}:${String(req.body?.email||"").trim().toLowerCase()}`;
  const now=Date.now();
  let record=loginAttempts.get(key);
  if(!record||record.resetAt<=now)record={count:0,resetAt:now+15*60*1000};
  record.count+=1;
  loginAttempts.set(key,record);
  if(loginAttempts.size>5000){for(const [k,v] of loginAttempts)if(v.resetAt<=now)loginAttempts.delete(k);}
  if(record.count>10)return res.status(429).json({error:"Bạn đã thử đăng nhập quá nhiều lần. Vui lòng chờ 15 phút."});
  next();
}

// -------------------- AUTH API --------------------
app.get("/api/auth/me",(req,res)=>res.json({user:req.user||null}));

app.post("/api/auth/register",requireSameOrigin,async(req,res)=>{
  try{
    const user=await registerUser(req.body||{});
    createSession(user.id,res);
    res.status(201).json({user});
  }catch(error){
    const message=error.message||"Không thể tạo tài khoản.";
    const status=/đã được đăng ký/i.test(message)?409:400;
    res.status(status).json({error:message});
  }
});

app.post("/api/auth/login",requireSameOrigin,loginRateLimit,async(req,res)=>{
  try{
    const user=await authenticateUser(req.body?.email,req.body?.password);
    if(!user)return res.status(401).json({error:"Email hoặc mật khẩu không chính xác."});
    loginAttempts.delete(`${req.ip}:${String(req.body?.email||"").trim().toLowerCase()}`);
    createSession(user.id,res);
    res.json({user});
  }catch(error){
    console.error("Login error:",error);
    res.status(500).json({error:"Không thể đăng nhập lúc này."});
  }
});

app.post("/api/auth/logout",requireSameOrigin,(req,res)=>{
  destroySession(req,res);
  res.status(204).end();
});

// Admin information is never trusted from client-supplied role fields.
app.get("/api/admin/users",requireAdmin,(req,res)=>{
  const users=db.prepare("SELECT id,name,email,role,created_at FROM users ORDER BY id DESC LIMIT 500").all();
  const total=db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  res.json({users:users.map(publicUser),total});
});

// -------------------- DOCUMENT API --------------------
const storage=multer.diskStorage({
  destination:(_req,_file,cb)=>cb(null,uploadsDir),
  filename:(_req,file,cb)=>{
    const safe=path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g,"_");
    cb(null,`${Date.now()}-${safe}`);
  }
});
const upload=multer({
  storage,
  limits:{fileSize:20*1024*1024},
  fileFilter:(_req,file,cb)=>{
    const ext=path.extname(file.originalname).toLowerCase();
    const allowed=new Set([".pdf",".doc",".docx",".ppt",".pptx",".txt",".png",".jpg",".jpeg"]);
    cb(allowed.has(ext)?null:new Error("Định dạng tệp chưa được hỗ trợ."),allowed.has(ext));
  }
});
app.post("/api/documents",requireSameOrigin,requireAdmin,upload.single("document"),(req,res)=>{
  if(!req.file)return res.status(400).json({error:"Chưa nhận được tệp."});
  const meta={
    id:`upload-${Date.now()}`,subject:req.body.subject,grade:req.body.grade,
    category:req.body.category,title:String(req.body.title||req.file.originalname).slice(0,120),
    filename:req.file.filename,originalName:req.file.originalname,size:req.file.size,
    uploadedAt:new Date().toISOString(),uploadedBy:req.user.id
  };
  const index=path.join(uploadsDir,"index.json");
  const docs=fs.existsSync(index)?JSON.parse(fs.readFileSync(index,"utf8")):[];
  docs.push(meta);
  fs.writeFileSync(index,JSON.stringify(docs,null,2));
  res.status(201).json({document:meta,localOnly:false});
});
app.get("/api/documents",(req,res)=>{
  const index=path.join(uploadsDir,"index.json");
  res.json(fs.existsSync(index)?JSON.parse(fs.readFileSync(index,"utf8")):[]);
});

app.post("/api/ai/difficulty",async(req,res)=>{
  const key=process.env.GEMINI_API_KEY;
  if(!key)return res.status(503).json({error:"Chưa cấu hình GEMINI_API_KEY trong file server/.env."});
  const {text="",title="Đề thi"}=req.body||{};
  if(!String(text).trim())return res.status(400).json({error:"Đề thi chưa có nội dung văn bản để phân tích."});
  try{
    const genAI=new GoogleGenerativeAI(key);
    const model=genAI.getGenerativeModel({model:process.env.GEMINI_MODEL||"gemini-2.5-flash"});
    const prompt=`Bạn là trợ lý đánh giá độ khó đề thi Toán THPT. Hãy phân tích đề sau bằng tiếng Việt, không tự khẳng định đáp án nếu thiếu dữ liệu. Trả lời ngắn gọn theo cấu trúc: Mức độ tổng quát (dễ/trung bình/khó), phân tích theo kiến thức, độ phân hóa, thời gian ước lượng và lưu ý.\\nTên đề: ${String(title).slice(0,120)}\\nNội dung đề:\\n${String(text).slice(0,18000)}`;
    const result=await model.generateContent(prompt);
    res.json({analysis:result.response.text()});
  }catch(err){console.error("Gemini error:",err);res.status(502).json({error:"Gemini không thể xử lý yêu cầu lúc này. Hãy kiểm tra model, API key và quota."});}
});

app.use((err,_req,res,_next)=>{
  console.error(err.message);
  const status=err.name==="MulterError"?400:400;
  res.status(status).json({error:err.message||"Yêu cầu không hợp lệ."});
});

await createInitialAdmin();
app.listen(port,()=>console.log(`MAI HỌC đang chạy tại http://localhost:${port}`));
