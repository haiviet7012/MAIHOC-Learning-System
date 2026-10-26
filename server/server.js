import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {GoogleGenerativeAI} from "@google/generative-ai";
import nodemailer from "nodemailer";
import {
  db, publicUser, registerUser, authenticateUser, createSession, destroySession,
  loadCurrentUser, requireAuth, requireAdmin, requireSameOrigin, createInitialAdmin
} from "./auth.js";

dotenv.config();
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,"..");
const app=express();
const port=Number(process.env.PORT||3000);
const uploadsDir=path.join(root,"uploads");
const pendingDir=path.join(uploadsDir,"pending");
fs.mkdirSync(uploadsDir,{recursive:true});
fs.mkdirSync(pendingDir,{recursive:true});
function notifyUser(userId,type,title,message,link=null){db.prepare("INSERT INTO notifications(user_id,type,title,message,link) VALUES(?,?,?,?,?)").run(userId,type,title,message,link);}
function notifyAdmins(type,title,message,link=null){const admins=db.prepare("SELECT id FROM users WHERE role='admin'").all();for(const a of admins)notifyUser(a.id,type,title,message,link);}
async function emailAdmins(subject,textBody){
  const {SMTP_HOST,SMTP_PORT,SMTP_USER,SMTP_PASS,SMTP_FROM,ADMIN_EMAIL}=process.env;
  if(!SMTP_HOST||!SMTP_USER||!SMTP_PASS||!ADMIN_EMAIL){console.warn("SMTP chưa cấu hình; bỏ qua email thông báo Admin.");return false;}
  const transporter=nodemailer.createTransport({host:SMTP_HOST,port:Number(SMTP_PORT||587),secure:Number(SMTP_PORT||587)===465,auth:{user:SMTP_USER,pass:SMTP_PASS}});
  await transporter.sendMail({from:SMTP_FROM||SMTP_USER,to:ADMIN_EMAIL,subject,text:textBody});return true;
}

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
app.use((req,res,next)=>req.path==="/server"||req.path.startsWith("/server/")||req.path.startsWith("/uploads/pending/")?res.sendStatus(404):next());
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
    notifyUser(user.id,"account_created","Tạo tài khoản thành công","Chào mừng bạn đến với MAI HỌC.");
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

// -------------------- NOTIFICATIONS + LEARNING PROGRESS --------------------
app.get("/api/notifications",requireAuth,(req,res)=>{
  const items=db.prepare("SELECT id,type,title,message,link,read_at AS readAt,created_at AS createdAt FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 60").all(req.user.id);
  const unread=db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND read_at IS NULL").get(req.user.id).n;
  res.json({items,unread});
});
app.post("/api/notifications/:id/read",requireAuth,(req,res)=>{
  db.prepare("UPDATE notifications SET read_at=datetime('now') WHERE id=? AND user_id=?").run(Number(req.params.id),req.user.id);
  res.json({ok:true});
});
app.post("/api/notifications/read-all",requireAuth,(req,res)=>{
  db.prepare("UPDATE notifications SET read_at=datetime('now') WHERE user_id=? AND read_at IS NULL").run(req.user.id);
  res.json({ok:true});
});
app.get("/api/admin/progress",requireAdmin,(req,res)=>{const rows=db.prepare("SELECT p.id,u.name AS userName,u.email AS userEmail,p.item_type AS itemType,p.item_id AS itemId,p.subject,p.grade,p.status,p.progress_percent AS progressPercent,p.score,p.updated_at AS updatedAt FROM user_progress p JOIN users u ON u.id=p.user_id ORDER BY p.updated_at DESC LIMIT 300").all();res.json({progress:rows});});
app.get("/api/progress",requireAuth,(req,res)=>{
  const rows=db.prepare("SELECT id,item_type AS itemType,item_id AS itemId,subject,grade,status,progress_percent AS progressPercent,score,answers_json AS answers,last_position AS lastPosition,started_at AS startedAt,updated_at AS updatedAt FROM user_progress WHERE user_id=? ORDER BY updated_at DESC").all(req.user.id);
  res.json({progress:rows});
});
app.put("/api/progress",requireSameOrigin,requireAuth,(req,res)=>{
  const b=req.body||{}, type=String(b.itemType||""), id=String(b.itemId||"");
  if(!["lesson","document","exam","practice"].includes(type)||!id||id.length>180)return res.status(400).json({error:"Loại hoặc ID nội dung không hợp lệ."});
  const percent=Math.max(0,Math.min(100,Math.round(Number(b.progressPercent)||0)));
  const status=["not_started","in_progress","completed"].includes(b.status)?b.status:(percent===100?"completed":"in_progress");
  const answers=b.answers==null?null:JSON.stringify(b.answers).slice(0,50000);
  db.prepare(`INSERT INTO user_progress(user_id,item_type,item_id,subject,grade,status,progress_percent,score,answers_json,last_position,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(user_id,item_type,item_id) DO UPDATE SET subject=excluded.subject,grade=excluded.grade,status=excluded.status,progress_percent=excluded.progress_percent,score=excluded.score,answers_json=excluded.answers_json,last_position=excluded.last_position,updated_at=datetime('now')`)
    .run(req.user.id,type,id,String(b.subject||"Toán").slice(0,60),String(b.grade||"10").slice(0,5),status,percent,Number.isFinite(Number(b.score))&&b.score!==""?Number(b.score):null,answers,String(b.lastPosition||"").slice(0,300));
  notifyUser(req.user.id,"progress_saved","Đã lưu tiến trình học",`Tiến trình “${id}” đã được cập nhật (${percent}%).`,null);
  res.json({ok:true,progressPercent:percent,status});
});

// -------------------- DOCUMENT UPLOAD + ADMIN REVIEW --------------------
const storage=multer.diskStorage({
  destination:(req,_file,cb)=>cb(null,req.user?.role==="admin"?uploadsDir:pendingDir),
  filename:(_req,file,cb)=>{const safe=path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g,"_");cb(null,`${Date.now()}-${safe}`);}
});
const upload=multer({storage,limits:{fileSize:20*1024*1024},fileFilter:(_req,file,cb)=>{
  const ext=path.extname(file.originalname).toLowerCase();const allowed=new Set([".pdf",".doc",".docx",".ppt",".pptx",".txt",".png",".jpg",".jpeg"]);
  cb(allowed.has(ext)?null:new Error("Định dạng tệp chưa được hỗ trợ."),allowed.has(ext));
}});
app.post("/api/documents",requireSameOrigin,requireAuth,upload.single("document"),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:"Chưa nhận được tệp."});
  const b=req.body||{}, title=String(b.title||req.file.originalname).slice(0,120);
  if(req.user.role==="admin"){
    const meta={id:`upload-${Date.now()}`,subject:b.subject,grade:b.grade,category:b.category,title,filename:req.file.filename,originalName:req.file.originalname,size:req.file.size,uploadedAt:new Date().toISOString(),uploadedBy:req.user.id};
    const index=path.join(uploadsDir,"index.json");const docs=fs.existsSync(index)?JSON.parse(fs.readFileSync(index,"utf8")):[];
    docs.push(meta);fs.writeFileSync(index,JSON.stringify(docs,null,2));
    return res.status(201).json({document:meta,status:"approved",localOnly:false});
  }
  const result=db.prepare("INSERT INTO document_submissions(user_id,subject,grade,category,title,filename,original_name,size) VALUES(?,?,?,?,?,?,?,?)")
    .run(req.user.id,String(b.subject||"Toán"),String(b.grade||"10"),String(b.category||"theory"),title,req.file.filename,req.file.originalname,req.file.size);
  notifyAdmins("document_pending","Có tài liệu chờ duyệt",`${req.user.name} đã gửi “${title}” để duyệt.`,"admin");
  try{await emailAdmins("MAI HỌC: Có tài liệu chờ duyệt",`Người gửi: ${req.user.name} (${req.user.email})\nTài liệu: ${title}\nMôn: ${b.subject||"Toán"} · Lớp ${b.grade||"10"}\nVui lòng đăng nhập trang quản trị MAI HỌC để duyệt.`);}catch(err){console.error("Không gửi được email cho Admin:",err.message);}
  notifyUser(req.user.id,"document_submitted","Đã gửi tài liệu chờ duyệt",`“${title}” đã được gửi đến Admin để xét duyệt.`);
  res.status(201).json({submissionId:result.lastInsertRowid,title,status:"pending",localOnly:false});
});
app.get("/api/documents",(req,res)=>{
  const index=path.join(uploadsDir,"index.json");res.json(fs.existsSync(index)?JSON.parse(fs.readFileSync(index,"utf8")):[]);
});
app.get("/api/admin/submissions",requireAdmin,(req,res)=>{
  const rows=db.prepare("SELECT s.id,s.subject,s.grade,s.category,s.title,s.original_name AS originalName,s.size,s.status,s.created_at AS createdAt,u.name AS userName,u.email AS userEmail FROM document_submissions s JOIN users u ON u.id=s.user_id WHERE s.status='pending' ORDER BY s.id ASC").all();
  res.json({submissions:rows});
});
app.post("/api/admin/submissions/:id/review",requireSameOrigin,requireAdmin,(req,res)=>{
  const id=Number(req.params.id), decision=String(req.body?.decision||""), note=String(req.body?.note||"").slice(0,500);
  if(!Number.isInteger(id)||!["approved","rejected"].includes(decision))return res.status(400).json({error:"Quyết định duyệt không hợp lệ."});
  const submission=db.prepare("SELECT * FROM document_submissions WHERE id=? AND status='pending'").get(id);
  if(!submission)return res.status(404).json({error:"Không tìm thấy tài liệu đang chờ duyệt."});
  const review=db.transaction(()=>{
    db.prepare("UPDATE document_submissions SET status=?,admin_note=?,reviewed_by=?,reviewed_at=datetime('now') WHERE id=?").run(decision,note,req.user.id,id);
    if(decision==="approved"){
      const source=path.join(pendingDir,submission.filename),destName=`approved-${Date.now()}-${submission.filename}`,dest=path.join(uploadsDir,destName);
      if(fs.existsSync(source))fs.renameSync(source,dest);
      const index=path.join(uploadsDir,"index.json"),docs=fs.existsSync(index)?JSON.parse(fs.readFileSync(index,"utf8")):[];
      docs.push({id:`submission-${id}`,subject:submission.subject,grade:submission.grade,category:submission.category,title:submission.title,filename:destName,originalName:submission.original_name,size:submission.size,uploadedAt:new Date().toISOString(),uploadedBy:submission.user_id});
      fs.writeFileSync(index,JSON.stringify(docs,null,2));
    }else{const source=path.join(pendingDir,submission.filename);if(fs.existsSync(source))fs.unlinkSync(source);}
    notifyUser(submission.user_id,decision==="approved"?"document_approved":"document_rejected",decision==="approved"?"Tài liệu đã được duyệt":"Tài liệu chưa được duyệt",decision==="approved"?`“${submission.title}” đã được Admin duyệt và thêm vào thư viện.`:`“${submission.title}” chưa được duyệt.${note?" Ghi chú: "+note:""}`);
  });
  review();res.json({ok:true,status:decision});
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
