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

const documentsDir=path.join(uploadsDir,"documents");

fs.mkdirSync(uploadsDir,{recursive:true});

fs.mkdirSync(pendingDir,{recursive:true});

fs.mkdirSync(documentsDir,{recursive:true});

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

  res.setHeader("X-Frame-Options","SAMEORIGIN");

  next();

});

app.use(express.json({limit:"1mb"}));

app.use(loadCurrentUser);

// Do not expose backend source, environment files or the local account database as static assets.

app.use((req,res,next)=>req.path==="/server"||req.path.startsWith("/server/")||req.path.startsWith("/uploads/")?res.sendStatus(404):next());

app.use(express.static(path.join(root, "public")));

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

  notifyUser(req.user.id,"progress_saved","Da luu tien trinh hoc",`Tien trinh ${id} da duoc cap nhat (${percent}%).`,null);

  res.json({ok:true,progressPercent:percent,status});

});



// -------------------- DOCUMENT UPLOAD + ADMIN REVIEW --------------------

const upload=multer({
  storage:multer.memoryStorage(),
  limits:{fileSize:20*1024*1024},
  fileFilter:(_req,file,cb)=>{
    const ext=path.extname(file.originalname).toLowerCase();
    const allowed=new Set([".pdf",".doc",".docx",".ppt",".pptx",".txt",".png",".jpg",".jpeg"]);
    cb(allowed.has(ext)?null:new Error("Unsupported document format."),allowed.has(ext));
  }
});

function storedFilename(originalName){
  const safe=path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g,"_");
  return `${Date.now()}-${Math.random().toString(36).slice(2,8)}-${safe}`;
}

function documentResponse(row){
  const fileUrl=`/api/documents/${encodeURIComponent(row.id)}/file`;
  return {
    id:row.id,subject:row.subject,grade:row.grade,category:row.category,
    title:row.title,filename:row.filename,originalName:row.original_name,
    size:row.size,contentType:row.content_type,uploadedAt:row.uploaded_at,
    uploadedBy:row.uploaded_by,url:fileUrl,fileUrl,downloadUrl:fileUrl,
    fileExists:true,localOnly:false
  };
}

function contentTypeFor(filename){
  const extension=path.extname(filename).toLowerCase();
  const types={
    ".pdf":"application/pdf", ".txt":"text/plain; charset=utf-8",
    ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg",
    ".doc":"application/msword",
    ".docx":"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".ppt":"application/vnd.ms-powerpoint",
    ".pptx":"application/vnd.openxmlformats-officedocument.presentationml.presentation"
  };
  return types[extension]||"application/octet-stream";
}

function importLegacyDocuments(){
  const migrationName="legacy-upload-index-to-sqlite-v1";
  if(db.prepare("SELECT 1 FROM app_migrations WHERE name=?").get(migrationName))return;
  const indexPath=path.join(uploadsDir,"index.json");
  if(!fs.existsSync(indexPath))return;
  try{
    const entries=JSON.parse(fs.readFileSync(indexPath,"utf8"));
    if(!Array.isArray(entries))return;
    const insert=db.prepare(`INSERT OR IGNORE INTO documents
      (id,subject,grade,category,title,filename,original_name,size,content_type,file_data,uploaded_by,uploaded_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,COALESCE(?,datetime('now')))`);
    for(const entry of entries){
      if(!entry?.id||!entry.filename)continue;
      if(db.prepare("SELECT 1 FROM documents WHERE id=?").get(String(entry.id)))continue;
      const source=path.join(uploadsDir,path.basename(entry.filename));
      if(!fs.existsSync(source))continue;
      const fileData=fs.readFileSync(source);
      const filename=storedFilename(entry.originalName||entry.filename);
      fs.copyFileSync(source,path.join(documentsDir,filename),fs.constants.COPYFILE_EXCL);
      insert.run(String(entry.id),String(entry.subject||"Toan"),String(entry.grade||"10"),
        String(entry.category||"theory"),String(entry.title||entry.originalName||"Document"),
        filename,String(entry.originalName||entry.filename),fileData.length,
        contentTypeFor(entry.originalName||entry.filename),fileData,entry.uploadedBy||null,
        entry.uploadedAt||null);
    }
    db.prepare("INSERT OR IGNORE INTO app_migrations(name) VALUES(?)").run(migrationName);
  }catch(error){
    console.error("Could not import legacy uploaded documents:",error.message);
  }
}

function normalizeLegacyDocumentCategories(){
  const migrationName="legacy-practice-title-category-v1";
  if(db.prepare("SELECT 1 FROM app_migrations WHERE name=?").get(migrationName))return;
  const rows=db.prepare("SELECT id,title FROM documents WHERE category='exam'").all();
  const update=db.prepare("UPDATE documents SET category='practice' WHERE id=?");
  const migrate=db.transaction(()=>{
    for(const row of rows){
      const normalized=String(row.title).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replaceAll(String.fromCharCode(273),"d").replaceAll(String.fromCharCode(272),"d").toLowerCase();
      if(/\b(on tap|luyen tap)\b/.test(normalized))update.run(row.id);
    }
    db.prepare("INSERT OR IGNORE INTO app_migrations(name) VALUES(?)").run(migrationName);
  });
  migrate();
}

app.post("/api/documents",requireSameOrigin,requireAuth,upload.single("document"),(req,res)=>{
  if(!req.file)return res.status(400).json({error:"No document was received."});

  const b=req.body||{};
  const allowedCategories=new Set(["theory","practice","exam","exercise","answer"]);
  if(!allowedCategories.has(String(b.category||""))){
    return res.status(400).json({error:"Choose a valid document category."});
  }
  const title=String(b.title||req.file.originalname).slice(0,120);
  const filename=storedFilename(req.file.originalname);
  const contentType=contentTypeFor(req.file.originalname);
  const isAdmin=req.user.role==="admin";
  const destination=isAdmin?documentsDir:pendingDir;
  fs.writeFileSync(path.join(destination,filename),req.file.buffer,{flag:"wx"});

  if(isAdmin){
    const id=`upload-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    db.prepare(`INSERT INTO documents
      (id,subject,grade,category,title,filename,original_name,size,content_type,file_data,uploaded_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
        id,String(b.subject||"Toan"),String(b.grade||"10"),String(b.category||"theory"),
        title,filename,req.file.originalname,req.file.size,
        contentType,req.file.buffer,req.user.id
      );
    const row=db.prepare("SELECT * FROM documents WHERE id=?").get(id);
    return res.status(201).json({document:documentResponse(row),status:"approved",localOnly:false});
  }

  const result=db.prepare(`INSERT INTO document_submissions
    (user_id,subject,grade,category,title,filename,original_name,size,file_data,content_type)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
      req.user.id,String(b.subject||"Toan"),String(b.grade||"10"),String(b.category||"theory"),
      title,filename,req.file.originalname,req.file.size,req.file.buffer,contentType
    );
  notifyAdmins("document_pending","Document awaiting review",`${req.user.name} submitted ${title}.`,"admin");
  notifyUser(req.user.id,"document_submitted","Document submitted for review",`${title} was sent to an administrator for review.`);
  return res.status(201).json({submissionId:result.lastInsertRowid,title,status:"pending",localOnly:false});
});

// -------------------- DOCUMENT LIBRARY API --------------------

app.get("/api/documents",(_req,res)=>{
  const documents=db.prepare("SELECT id,subject,grade,category,title,filename,original_name,size,content_type,uploaded_by,uploaded_at FROM documents ORDER BY uploaded_at DESC").all();
  res.setHeader("Cache-Control","no-store");
  res.json(documents.map(documentResponse));
});

app.delete("/api/admin/documents/:id",requireSameOrigin,requireAdmin,(req,res)=>{
  const document=db.prepare("SELECT id,filename FROM documents WHERE id=?").get(req.params.id);
  if(!document)return res.status(404).json({error:"Document was not found."});

  const result=db.prepare("DELETE FROM documents WHERE id=?").run(document.id);
  if(result.changes){
    const storedPath=path.join(documentsDir,path.basename(document.filename));
    if(fs.existsSync(storedPath))fs.unlinkSync(storedPath);
  }
  return res.json({ok:true,deletedId:document.id});
});

app.get("/api/documents/:id/file",(req,res)=>{
  const document=db.prepare("SELECT * FROM documents WHERE id=?").get(req.params.id);
  if(!document)return res.sendStatus(404);

  const extension=path.extname(document.original_name).toLowerCase();
  const inlineTypes=new Set([".pdf",".txt",".png",".jpg",".jpeg"]);
  const disposition=inlineTypes.has(extension)?"inline":"attachment";
  res.setHeader("Content-Type",document.content_type||"application/octet-stream");
  res.setHeader("Content-Length",document.file_data.length);
  res.setHeader("Content-Disposition",`${disposition}; filename*=UTF-8''${encodeURIComponent(document.original_name)}`);
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Cache-Control","private, no-store");
  res.end(document.file_data);
});

app.get("/api/admin/submissions",requireAdmin,(req,res)=>{

  const rows=db.prepare("SELECT s.id,s.subject,s.grade,s.category,s.title,s.original_name AS originalName,s.size,s.status,s.created_at AS createdAt,u.name AS userName,u.email AS userEmail FROM document_submissions s JOIN users u ON u.id=s.user_id WHERE s.status='pending' ORDER BY s.id ASC").all();

  res.json({submissions:rows});

});

app.post("/api/admin/submissions/:id/review",requireSameOrigin,requireAdmin,(req,res)=>{
  const id=Number(req.params.id);
  const decision=String(req.body?.decision||"");
  const note=String(req.body?.note||"").slice(0,500);
  if(!Number.isInteger(id)||!["approved","rejected"].includes(decision)){
    return res.status(400).json({error:"Invalid review decision."});
  }

  const submission=db.prepare("SELECT * FROM document_submissions WHERE id=? AND status='pending'").get(id);
  if(!submission)return res.status(404).json({error:"Pending document was not found."});

  const fileData=submission.file_data
    ? Buffer.from(submission.file_data)
    : (fs.existsSync(path.join(pendingDir,submission.filename))
        ? fs.readFileSync(path.join(pendingDir,submission.filename))
        : null);
  if(decision==="approved"&&!fileData){
    return res.status(410).json({error:"The stored document file is missing."});
  }

  let approvedFilename=null;
  if(decision==="approved"){
    approvedFilename=storedFilename(submission.original_name);
    const source=path.join(pendingDir,submission.filename);
    if(fs.existsSync(source)){
      fs.copyFileSync(source,path.join(documentsDir,approvedFilename),fs.constants.COPYFILE_EXCL);
    }else{
      fs.writeFileSync(path.join(documentsDir,approvedFilename),fileData,{flag:"wx"});
    }
  }

  try{
    const review=db.transaction(()=>{
      db.prepare("UPDATE document_submissions SET status=?,admin_note=?,reviewed_by=?,reviewed_at=datetime('now') WHERE id=?")
        .run(decision,note,req.user.id,id);
      if(decision==="approved"){
        db.prepare(`INSERT INTO documents
          (id,subject,grade,category,title,filename,original_name,size,content_type,file_data,uploaded_by)
          VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
            `submission-${id}`,submission.subject,submission.grade,submission.category,
            submission.title,approvedFilename,submission.original_name,submission.size,
            submission.content_type||contentTypeFor(submission.original_name),fileData,submission.user_id
          );
      }
      notifyUser(submission.user_id,
        decision==="approved"?"document_approved":"document_rejected",
        decision==="approved"?"Document approved":"Document rejected",
        decision==="approved"?`${submission.title} was approved and added to the library.`:`${submission.title} was not approved.${note?" Note: "+note:""}`);
    });
    review();
  }catch(error){
    if(approvedFilename){
      const destination=path.join(documentsDir,approvedFilename);
      if(fs.existsSync(destination))fs.unlinkSync(destination);
    }
    throw error;
  }

  const pendingFile=path.join(pendingDir,submission.filename);
  if(fs.existsSync(pendingFile))fs.unlinkSync(pendingFile);
  return res.json({ok:true,status:decision});
});

app.post("/api/ai/difficulty",async(req,res)=>{

  const key=process.env.GEMINI_API_KEY;

  if(!key)return res.status(503).json({error:"Chưa cấu hình GEMINI_API_KEY trong file server/.env."});

  const {text="",title="Đề thi"}=req.body||{};

  if(!String(text).trim())return res.status(400).json({error:"Đề thi chưa có nội dung văn bản để phân tích."});

  try{

    const genAI=new GoogleGenerativeAI(key);

    const model=genAI.getGenerativeModel({model:process.env.GEMINI_MODEL||"gemini-2.5-flash"});

    const prompt=`Bạn là trợ lý đánh giá độ khó đề thi Toán THPT. Hãy phân tích đề sau bằng tiếng Việt, không tự khẳng định đáp án nếu thiếu dữ liệu. Trả lời ngắn gọn theo cấu trúc: Mức độ tổng quát (dễ/trung bình/khó), phân tích theo kiến thức, độ phân hóa, thời gian ước lượng và lưu ý.\nTên đề: ${String(title).slice(0,120)}\nNội dung đề:\n${String(text).slice(0,18000)}`;

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
importLegacyDocuments();
normalizeLegacyDocumentCategories();

app.listen(port,()=>console.log(`MAI HOC is running at http://localhost:${port}`));
