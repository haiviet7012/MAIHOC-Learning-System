import express from "express";

import multer from "multer";

import dotenv from "dotenv";

import fs from "node:fs";

import path from "node:path";

import {fileURLToPath} from "node:url";

import {GoogleGenerativeAI} from "@google/generative-ai";

import nodemailer from "nodemailer";
import { normalizeAnswerKey, normalizeAnswerKeyDocument, serializeAnswerKey, gradeAnswers } from "./grading/engine.js";

import {

  db, publicUser, registerUser, authenticateUser, createSession, destroySession,

  loadCurrentUser, requireAuth, requireAdmin, requireSameOrigin, createInitialAdmin

} from "./auth.js";



dotenv.config();

const __dirname=path.dirname(fileURLToPath(import.meta.url));

const root=path.resolve(__dirname,"..");

function assessmentConfigFor(subject,category){
  try{
    const config=JSON.parse(fs.readFileSync(path.join(root,"configs","exam-layouts.json"),"utf8"));
    const normalize=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[đĐ]/g,"d").toLocaleLowerCase("vi").replace(/[^a-z0-9]/g,"");
    const match=Object.keys(config.subjects||{}).find(name=>normalize(name)===normalize(subject));
    const subjectConfig=match?config.subjects[match]:null;
    if(!subjectConfig)return null;
    return {layout:subjectConfig[category]||subjectConfig.assessment||null,grading:subjectConfig.grading||null};
  }catch(error){
    console.error("Could not load assessment grading config:",error.message);
    return null;
  }
}

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

app.use("/vendor/pdfjs/cmaps",express.static(path.join(__dirname,"node_modules","pdfjs-dist","cmaps"),{maxAge:"1d"}));
app.use("/vendor/pdfjs/standard_fonts",express.static(path.join(__dirname,"node_modules","pdfjs-dist","standard_fonts"),{maxAge:"1d"}));
app.use("/vendor/pdfjs/wasm",express.static(path.join(__dirname,"node_modules","pdfjs-dist","wasm"),{maxAge:"1d"}));
app.use("/vendor/pdfjs",express.static(path.join(__dirname,"node_modules","pdfjs-dist","build"),{maxAge:"1d"}));
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



app.delete("/api/admin/users/:id",requireSameOrigin,requireAdmin,(req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:"Invalid user ID."});
  if(id===req.user.id)return res.status(400).json({error:"You cannot delete your own account."});

  const user=db.prepare("SELECT id,role FROM users WHERE id=?").get(id);
  if(!user)return res.status(404).json({error:"User was not found."});
  if(user.role!=="user")return res.status(403).json({error:"Administrator accounts cannot be deleted here."});

  const pendingFiles=db.prepare("SELECT filename FROM document_submissions WHERE user_id=?").all(id);
  const result=db.prepare("DELETE FROM users WHERE id=? AND role='user'").run(id);
  if(!result.changes)return res.status(404).json({error:"User was not found."});

  for(const file of pendingFiles){
    const storedPath=path.join(pendingDir,path.basename(file.filename));
    try{if(fs.existsSync(storedPath))fs.unlinkSync(storedPath);}
    catch(error){console.error("Could not remove pending upload for deleted user:",error.message);}
  }
  const total=db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  return res.json({ok:true,deletedId:id,total});
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

app.delete("/api/notifications",requireSameOrigin,requireAuth,(req,res)=>{
  const result=db.prepare("DELETE FROM notifications WHERE user_id=?").run(req.user.id);
  return res.json({ok:true,deleted:result.changes,unread:0});
});

app.get("/api/admin/progress",requireAdmin,(req,res)=>{const rows=db.prepare("SELECT p.id,u.name AS userName,u.email AS userEmail,p.item_type AS itemType,p.item_id AS itemId,p.item_title AS itemTitle,p.subject,p.grade,p.status,p.progress_percent AS progressPercent,p.score,p.updated_at AS updatedAt FROM user_progress p JOIN users u ON u.id=p.user_id ORDER BY p.updated_at DESC LIMIT 300").all();res.json({progress:rows});});

app.get("/api/progress",requireAuth,(req,res)=>{

  const rows=db.prepare("SELECT id,item_type AS itemType,item_id AS itemId,item_title AS itemTitle,subject,grade,status,progress_percent AS progressPercent,score,answers_json AS answers,last_position AS lastPosition,started_at AS startedAt,updated_at AS updatedAt FROM user_progress WHERE user_id=? ORDER BY updated_at DESC").all(req.user.id);

  res.json({progress:rows});

});

app.put("/api/progress",requireSameOrigin,requireAuth,(req,res)=>{

  const b=req.body||{}, type=String(b.itemType||""), id=String(b.itemId||"");

  if(!["lesson","document","exam","practice"].includes(type)||!id||id.length>180)return res.status(400).json({error:"Loại hoặc ID nội dung không hợp lệ."});

  const requestedPercent=Math.max(0,Math.min(100,Math.round(Number(b.progressPercent)||0)));
  const previous=db.prepare("SELECT progress_percent AS progressPercent,status FROM user_progress WHERE user_id=? AND item_type=? AND item_id=?").get(req.user.id,type,id);
  const percent=previous?.status==="completed"?100:Math.max(previous?.progressPercent||0,requestedPercent);
  const wantsCompletion=b.status==="completed"&&percent===100;
  const status=wantsCompletion?"completed":(previous?.status==="completed"?"completed":"in_progress");
  const document=type==="document"?db.prepare("SELECT title FROM documents WHERE id=?").get(id):null;
  const itemTitle=String(b.itemTitle||document?.title||id).trim().slice(0,180)||id;

  const answers=b.answers==null?null:JSON.stringify(b.answers).slice(0,50000);

  db.prepare(`INSERT INTO user_progress(user_id,item_type,item_id,item_title,subject,grade,status,progress_percent,score,answers_json,last_position,updated_at)

    VALUES(?,?,?,?,?,?,?,?,?,?,?,datetime('now'))

    ON CONFLICT(user_id,item_type,item_id) DO UPDATE SET item_title=excluded.item_title,subject=excluded.subject,grade=excluded.grade,status=excluded.status,progress_percent=excluded.progress_percent,score=excluded.score,answers_json=excluded.answers_json,last_position=excluded.last_position,updated_at=datetime('now')`)

    .run(req.user.id,type,id,itemTitle,String(b.subject||"Toán").slice(0,60),String(b.grade||"10").slice(0,5),status,percent,Number.isFinite(Number(b.score))&&b.score!==""?Number(b.score):null,answers,String(b.lastPosition||percent).slice(0,300));

  let notificationCreated=false;
  if(wantsCompletion&&previous?.status!=="completed"){
    const notificationType=type==="exam"?"exam_completed":"lesson_completed";
    notifyUser(req.user.id,notificationType,`\u0110\u00e3 ho\u00e0n th\u00e0nh ${itemTitle}`,`B\u1ea1n \u0111\u00e3 ho\u00e0n th\u00e0nh ${itemTitle}.`);
    notificationCreated=true;
  }else if(!wantsCompletion&&Math.floor(percent/10)>Math.floor((previous?.progressPercent||0)/10)){
    notifyUser(req.user.id,"learning_progress",`Ti\u1ebfn tr\u00ecnh h\u1ecdc ${percent}% cho ${itemTitle}`,`${itemTitle} \u0111\u00e3 \u0111\u1ea1t ${percent}%.`);
    notificationCreated=true;
  }

  res.json({ok:true,progressPercent:percent,status,notificationCreated});

});

app.post("/api/exams/:id/submit",requireSameOrigin,async(req,res)=>{
  const document=db.prepare(`SELECT d.id,d.title,d.subject,d.grade,d.category,
    ak.file_data AS answerKeyData,ak.original_name AS answerKeyOriginalName,ak.normalized_json AS normalizedAnswerKey,
    ak.normalization_error AS answerKeyNormalizationError
    FROM documents d LEFT JOIN answer_keys ak ON ak.document_id=d.id WHERE d.id=?`)
    .get(String(req.params.id));
  if(!document||!["practice","exam"].includes(document.category))return res.status(404).json({error:"Exam or practice document was not found."});
  const rawAnswers=req.body?.answers;
  if(!rawAnswers||typeof rawAnswers!=="object"||Array.isArray(rawAnswers))return res.status(400).json({error:"Submit answers as a question-to-answer object."});
  const answers=Object.fromEntries(Object.entries(rawAnswers).slice(0,200).map(([question,value])=>[String(question).slice(0,40),String(value??"").slice(0,5000)]));
  let answerKey=null;
  if(document.normalizedAnswerKey){
    try{answerKey=JSON.parse(document.normalizedAnswerKey);}catch{}
  }else if(document.answerKeyData){
    const config=assessmentConfigFor(document.subject,document.category);
    answerKey=await normalizeAnswerKeyDocument(document.answerKeyData,document.answerKeyOriginalName,config?.layout,config?.grading);
    if(answerKey){
      db.prepare(`UPDATE answer_keys SET normalized_json=?,question_ids=?,grading_available=1,normalization_error=NULL
        WHERE document_id=?`).run(JSON.stringify(answerKey),JSON.stringify(Object.keys(answerKey.answers)),document.id);
    }
  }
  const assessmentConfig=assessmentConfigFor(document.subject,document.category);
  const grade=answerKey?gradeAnswers(answerKey,answers,assessmentConfig||{}):null;

  if(req.user){
    const previous=db.prepare("SELECT status FROM user_progress WHERE user_id=? AND item_type='exam' AND item_id=?").get(req.user.id,document.id);
    const save=db.transaction(()=>{
      db.prepare(`INSERT INTO user_progress(user_id,item_type,item_id,item_title,subject,grade,status,progress_percent,score,answers_json,last_position,updated_at)
        VALUES(?,'exam',?,?,?,?, 'completed',100,?,?, 'submitted',datetime('now'))
        ON CONFLICT(user_id,item_type,item_id) DO UPDATE SET item_title=excluded.item_title,subject=excluded.subject,grade=excluded.grade,status='completed',progress_percent=100,score=excluded.score,answers_json=excluded.answers_json,last_position='submitted',updated_at=datetime('now')`)
        .run(req.user.id,document.id,document.title,document.subject,document.grade,grade?.completeAnswerKey===false?null:(grade?.score??grade?.percent??null),JSON.stringify(answers));
      if(previous?.status!=="completed")notifyUser(req.user.id,"exam_completed",`Đã hoàn thành ${document.title}`,`Bạn đã hoàn thành ${document.title}.`);
    });
    save();
  }

  if(!grade)return res.json({graded:false,hasAnswerKey:Boolean(document.answerKeyData),message:document.answerKeyData
    ?document.answerKeyNormalizationError||"Đã nộp bài nhưng tệp đáp án chưa thể chuyển thành dữ liệu chấm điểm."
    :"Đã nộp bài. Đề này chưa có đáp án để chấm tự động."});
  if(grade.completeAnswerKey===false)return res.json({graded:false,hasAnswerKey:true,...grade,message:`\u0110\u00e1p \u00e1n chu\u1ea9n h\u00f3a c\u00f2n thi\u1ebfu ${grade.missingAnswerCount} m\u1ee5c b\u1eaft bu\u1ed9c n\u00ean ch\u01b0a th\u1ec3 ch\u1ea5m ch\u00ednh x\u00e1c.`});
  return res.json({graded:true,...grade});
});



// -------------------- DOCUMENT UPLOAD + ADMIN REVIEW --------------------

const upload=multer({
  storage:multer.memoryStorage(),
  limits:{fileSize:20*1024*1024,files:2},
  fileFilter:(_req,file,cb)=>{
    const ext=path.extname(file.originalname).toLowerCase();
    const allowed=new Set([".pdf",".doc",".docx",".ppt",".pptx",".txt",".png",".jpg",".jpeg",".json",".csv"]);
    cb(allowed.has(ext)?null:new Error("Unsupported document format."),allowed.has(ext));
  }
});

function storedFilename(originalName){
  const safe=path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g,"_");
  return `${Date.now()}-${Math.random().toString(36).slice(2,8)}-${safe}`;
}

function documentResponse(row){
  const fileUrl=`/api/documents/${encodeURIComponent(row.id)}/file`;
  let questionIds=[];
  try{questionIds=JSON.parse(row.answer_key_question_ids||"[]");if(!Array.isArray(questionIds))questionIds=[];}catch{}
  return {
    id:row.id,subject:row.subject,grade:row.grade,category:row.category,
    title:row.title,filename:row.filename,originalName:row.original_name,
    size:row.size,contentType:row.content_type,uploadedAt:row.uploaded_at,
    uploadedBy:row.uploaded_by,hasAnswerKey:Boolean(row.answer_key_original_name),questionIds,
    answerKeyOriginalName:row.answer_key_original_name||null,url:fileUrl,fileUrl,downloadUrl:fileUrl,
    fileExists:true,localOnly:false
  };
}

function contentTypeFor(filename){
  const extension=path.extname(filename).toLowerCase();
  const types={
    ".pdf":"application/pdf", ".txt":"text/plain; charset=utf-8",
    ".json":"application/json; charset=utf-8", ".csv":"text/csv; charset=utf-8",
    ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg",
    ".doc":"application/msword",
    ".docx":"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".ppt":"application/vnd.ms-powerpoint",
    ".pptx":"application/vnd.openxmlformats-officedocument.presentationml.presentation"
  };
  return types[extension]||"application/octet-stream";
}

function saveAnswerKeyRecord(documentId,file,uploadedBy=null,normalizedOverride=undefined){
  const originalName=String(file.originalname||"answer-key.txt");
  const buffer=Buffer.from(file.buffer||[]);
  const normalized=normalizedOverride===undefined?normalizeAnswerKey(buffer,originalName):normalizedOverride;
  const sourceFormat=path.extname(originalName).slice(1).toLowerCase()||"unknown";
  db.prepare(`INSERT INTO answer_keys
    (document_id,original_name,content_type,file_data,source_format,normalized_json,question_ids,grading_available,normalization_error,uploaded_by)
    VALUES(?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(document_id) DO UPDATE SET original_name=excluded.original_name,content_type=excluded.content_type,
      file_data=excluded.file_data,source_format=excluded.source_format,normalized_json=excluded.normalized_json,
      question_ids=excluded.question_ids,grading_available=excluded.grading_available,
      normalization_error=excluded.normalization_error,uploaded_by=excluded.uploaded_by,uploaded_at=datetime('now')`)
    .run(documentId,originalName,contentTypeFor(originalName),buffer,sourceFormat,
      normalized?JSON.stringify(normalized):null,
      normalized?JSON.stringify(Object.keys(normalized.answers)):null,
      normalized?1:0,
      normalized?null:(path.extname(originalName).toLowerCase()===".pdf"
        ?"Không đọc được bảng đáp án dạng văn bản trong PDF. PDF scan cần Tesseract trên máy chủ; bố cục không hỗ trợ sẽ không được chấm tự động."
        :"Tệp đáp án chưa được chuẩn hóa. Hỗ trợ PDF có text, DOCX, JSON, CSV và TXT."),
      uploadedBy||null);
  return normalized;
}

async function migrateLegacyAnswerKeys(){
  const migrationName="separate-answer-key-table-v1";
  if(db.prepare("SELECT 1 FROM app_migrations WHERE name=?").get(migrationName))return;
  const rows=db.prepare(`SELECT id,subject,category,answer_key_data,answer_key_original_name,answer_key_content_type,uploaded_by
    FROM documents WHERE answer_key_data IS NOT NULL`).all();
  const records=[];
  for(const row of rows){
    if(db.prepare("SELECT 1 FROM answer_keys WHERE document_id=?").get(row.id))continue;
    const originalname=row.answer_key_original_name||"answer-key.txt";
    const config=assessmentConfigFor(row.subject,row.category);
    const normalized=await normalizeAnswerKeyDocument(Buffer.from(row.answer_key_data),originalname,config?.layout,config?.grading);
    records.push({row,originalname,normalized});
  }
  const migrate=db.transaction(()=>{
    for(const {row,originalname,normalized} of records){
      saveAnswerKeyRecord(row.id,{
        buffer:Buffer.from(row.answer_key_data),
        originalname
      },row.uploaded_by,normalized);
    }
    db.prepare(`UPDATE documents SET answer_key_data=NULL,answer_key_original_name=NULL,
      answer_key_content_type=NULL,answer_key_question_ids=NULL
      WHERE id IN (SELECT document_id FROM answer_keys)`).run();
    db.prepare("INSERT OR IGNORE INTO app_migrations(name) VALUES(?)").run(migrationName);
  });
  migrate();
}

async function normalizeStoredPdfAnswerKeys(){
  const rows=db.prepare(`SELECT d.id,d.subject,d.category,ak.file_data,ak.original_name,ak.normalized_json
    FROM answer_keys ak JOIN documents d ON d.id=ak.document_id
    WHERE lower(ak.source_format) IN ('pdf','docx')`).all();
  for(const row of rows){
    let storedVersion=0;
    try{storedVersion=Number(JSON.parse(row.normalized_json||"{}").normalizerVersion)||0;}catch{}
    if(storedVersion>=2)continue;
    const config=assessmentConfigFor(row.subject,row.category);
    const normalized=await normalizeAnswerKeyDocument(Buffer.from(row.file_data),row.original_name,config?.layout,config?.grading);
    if(normalized){
      db.prepare(`UPDATE answer_keys SET normalized_json=?,question_ids=?,grading_available=1,normalization_error=NULL
        WHERE document_id=?`).run(JSON.stringify(normalized),JSON.stringify(Object.keys(normalized.answers)),row.id);
    }else{
      db.prepare(`UPDATE answer_keys SET normalized_json=NULL,question_ids=NULL,grading_available=0,
        normalization_error=? WHERE document_id=?`).run(
        path.extname(row.original_name||"").toLowerCase()===".pdf"
          ?"Không đọc được bảng đáp án dạng văn bản trong PDF. PDF scan cần Tesseract trên máy chủ; bố cục không hỗ trợ sẽ không được chấm tự động."
          :"Tệp DOCX chưa chuyển được thành các hàng câu hỏi và đáp án.",row.id);
    }
  }
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

app.post("/api/documents",requireSameOrigin,requireAuth,upload.fields([{name:"document",maxCount:1},{name:"answerKey",maxCount:1}]),async(req,res)=>{
  const documentFile=req.files?.document?.[0];
  const answerKeyFile=req.files?.answerKey?.[0];
  if(!documentFile)return res.status(400).json({error:"No document was received."});

  const b=req.body||{};
  const allowedCategories=new Set(["theory","practice","exam","exercise","answer"]);
  if(!allowedCategories.has(String(b.category||""))){
    return res.status(400).json({error:"Choose a valid document category."});
  }
  if(answerKeyFile&&!new Set([".pdf",".docx",".txt",".json",".csv"]).has(path.extname(answerKeyFile.originalname).toLowerCase())){
    return res.status(400).json({error:"Answer keys must be PDF, DOCX, TXT, JSON, or CSV files. Legacy DOC files are not supported."});
  }
  const documentExtensions=new Set([".pdf",".doc",".docx",".ppt",".pptx",".txt",".png",".jpg",".jpeg"]);
  if(!documentExtensions.has(path.extname(documentFile.originalname).toLowerCase()))return res.status(400).json({error:"Unsupported question document format."});
  if(answerKeyFile&&!['practice','exam'].includes(String(b.category||'')))return res.status(400).json({error:"Answer keys can only be attached to practice and mock exam documents."});
  const config=assessmentConfigFor(String(b.subject||"Toan"),String(b.category||""));
  const parsedAnswerKey=answerKeyFile?await normalizeAnswerKeyDocument(answerKeyFile.buffer,answerKeyFile.originalname,config?.layout,config?.grading):null;
  const title=String(b.title||documentFile.originalname).slice(0,120);
  const filename=storedFilename(documentFile.originalname);
  const contentType=contentTypeFor(documentFile.originalname);
  const isAdmin=req.user.role==="admin";
  const destination=isAdmin?documentsDir:pendingDir;
  fs.writeFileSync(path.join(destination,filename),documentFile.buffer,{flag:"wx"});

  if(isAdmin){
    const id=`upload-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const saveDocument=db.transaction(()=>{
      db.prepare(`INSERT INTO documents
        (id,subject,grade,category,title,filename,original_name,size,content_type,file_data,uploaded_by)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
          id,String(b.subject||"Toan"),String(b.grade||"10"),String(b.category||"theory"),
          title,filename,documentFile.originalname,documentFile.size,contentType,documentFile.buffer,req.user.id
        );
      if(answerKeyFile)saveAnswerKeyRecord(id,answerKeyFile,req.user.id,parsedAnswerKey);
    });
    saveDocument();
    const row=db.prepare(`SELECT d.*,ak.original_name AS answer_key_original_name,ak.question_ids AS answer_key_question_ids
      FROM documents d LEFT JOIN answer_keys ak ON ak.document_id=d.id WHERE d.id=?`).get(id);
    return res.status(201).json({document:documentResponse(row),status:"approved",localOnly:false});
  }

  const result=db.prepare(`INSERT INTO document_submissions
    (user_id,subject,grade,category,title,filename,original_name,size,file_data,content_type,answer_key_data,answer_key_original_name,answer_key_content_type,answer_key_question_ids)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      req.user.id,String(b.subject||"Toan"),String(b.grade||"10"),String(b.category||"theory"),
      title,filename,documentFile.originalname,documentFile.size,documentFile.buffer,contentType,
      answerKeyFile?.buffer||null,answerKeyFile?.originalname||null,answerKeyFile?contentTypeFor(answerKeyFile.originalname):null,
      parsedAnswerKey?JSON.stringify(Object.keys(parsedAnswerKey.answers)):null
    );
  notifyAdmins("document_pending","Có tài liệu mới chờ duyệt",`${req.user.name} đã gửi tài liệu ${title}.`,"admin");
  notifyUser(req.user.id,"document_submitted","Đã gửi tài liệu",`Tài liệu ${title} đã được gửi cho Admin duyệt.`);
  return res.status(201).json({submissionId:result.lastInsertRowid,title,status:"pending",localOnly:false});
});

// -------------------- DOCUMENT LIBRARY API --------------------

app.get("/api/documents",(_req,res)=>{
  const documents=db.prepare(`SELECT d.id,d.subject,d.grade,d.category,d.title,d.filename,d.original_name,d.size,d.content_type,
    d.uploaded_by,d.uploaded_at,ak.original_name AS answer_key_original_name,ak.question_ids AS answer_key_question_ids
    FROM documents d LEFT JOIN answer_keys ak ON ak.document_id=d.id ORDER BY d.uploaded_at DESC`).all();
  res.setHeader("Cache-Control","no-store");
  res.json(documents.map(documentResponse));
});

app.get("/api/admin/answer-keys",requireAdmin,(req,res)=>{
  const rows=db.prepare(`SELECT d.id,d.category,d.title,d.grade,d.original_name AS originalName,
    ak.original_name AS answerKeyOriginalName,ak.content_type AS answerKeyContentType,
    ak.source_format AS answerKeySourceFormat,ak.normalized_json AS normalizedAnswerKey,
    ak.normalization_error AS normalizationError,ak.grading_available AS gradingAvailable
    FROM documents d LEFT JOIN answer_keys ak ON ak.document_id=d.id
    WHERE d.category IN ('theory','practice','exam') ORDER BY d.grade,d.title`).all();
  const sections={theory:[],practice:[],exam:[]};
  for(const row of rows){
    sections[row.category].push({
      id:row.id,title:row.title,grade:row.grade,originalName:row.originalName,
      hasAnswerKey:Boolean(row.answerKeyOriginalName),
      answerKeyOriginalName:row.answerKeyOriginalName||null,
      answerKeyContentType:row.answerKeyContentType||null,
      answerKeySourceFormat:row.answerKeySourceFormat||null,
      normalizationError:row.normalizationError||null,
      gradingAvailable:Boolean(row.gradingAvailable&&row.normalizedAnswerKey)
    });
  }
  res.json({sections});
});

app.post("/api/admin/documents/:id/answer-key",requireSameOrigin,requireAdmin,upload.single("answerKey"),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:"Select an answer-key file."});
  const extension=path.extname(req.file.originalname).toLowerCase();
  if(![".pdf",".txt",".json",".csv",".docx"].includes(extension))return res.status(400).json({error:"Answer keys must be PDF, DOCX, TXT, JSON, or CSV files. Legacy DOC files are not supported."});
  const document=db.prepare("SELECT id,category,subject FROM documents WHERE id=?").get(String(req.params.id));
  if(!document)return res.status(404).json({error:"Question document was not found."});
  if(!["practice","exam"].includes(document.category))return res.status(400).json({error:"Theory documents do not need an answer key."});
  const config=assessmentConfigFor(document.subject,document.category);
  const normalized=await normalizeAnswerKeyDocument(req.file.buffer,req.file.originalname,config?.layout,config?.grading);
  const key=saveAnswerKeyRecord(document.id,req.file,req.user.id,normalized);
  return res.json({ok:true,hasAnswerKey:true,gradingAvailable:Boolean(key),answerKeyOriginalName:req.file.originalname,normalizedFormat:key?"json":null});
});

app.get("/api/admin/documents/:id/answer-key",requireAdmin,(req,res)=>{
  const row=db.prepare("SELECT file_data,original_name,content_type FROM answer_keys WHERE document_id=?").get(String(req.params.id));
  if(!row?.file_data)return res.status(404).json({error:"No answer key is attached to this document."});
  res.setHeader("Content-Type",row.content_type||"application/octet-stream");
  res.setHeader("Content-Disposition",`inline; filename*=UTF-8''${encodeURIComponent(row.original_name||"answer-key")}`);
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Cache-Control","private, no-store");
  res.end(row.file_data);
});

app.get("/api/admin/documents/:id/answer-key/normalized",requireAdmin,(req,res)=>{
  const format=String(req.query.format||"json").toLowerCase();
  if(!["json","csv","txt"].includes(format))return res.status(400).json({error:"Choose JSON, CSV, or TXT format."});
  const row=db.prepare("SELECT normalized_json FROM answer_keys WHERE document_id=?").get(String(req.params.id));
  if(!row?.normalized_json)return res.status(404).json({error:"This answer key has no normalized grading data."});
  let normalized;
  try{normalized=JSON.parse(row.normalized_json);}catch{return res.status(500).json({error:"The stored grading data is invalid."});}
  let output;
  try{output=serializeAnswerKey(normalized,format);}catch(error){return res.status(400).json({error:error.message});}
  const mime={json:"application/json; charset=utf-8",csv:"text/csv; charset=utf-8",txt:"text/plain; charset=utf-8"}[format];
  res.setHeader("Content-Type",mime);
  res.setHeader("Content-Disposition",`attachment; filename*=UTF-8''${encodeURIComponent(`answer-key-${req.params.id}.${format}`)}`);
  res.setHeader("Cache-Control","private, no-store");
  res.end(output);
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

  const rows=db.prepare("SELECT s.id,s.subject,s.grade,s.category,s.title,s.original_name AS originalName,s.size,s.status,s.created_at AS createdAt,s.answer_key_original_name AS answerKeyOriginalName,u.name AS userName,u.email AS userEmail FROM document_submissions s JOIN users u ON u.id=s.user_id WHERE s.status='pending' ORDER BY s.id ASC").all();

  res.json({submissions:rows});

});

app.post("/api/admin/submissions/:id/review",requireSameOrigin,requireAdmin,async(req,res)=>{
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

  let normalizedSubmissionAnswerKey=null;
  if(decision==="approved"&&submission.answer_key_data){
    const config=assessmentConfigFor(submission.subject,submission.category);
    normalizedSubmissionAnswerKey=await normalizeAnswerKeyDocument(
      Buffer.from(submission.answer_key_data),
      submission.answer_key_original_name||"answer-key.txt",
      config?.layout,
      config?.grading
    );
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
        const documentId=`submission-${id}`;
        db.prepare(`INSERT INTO documents
          (id,subject,grade,category,title,filename,original_name,size,content_type,file_data,uploaded_by)
          VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
            documentId,submission.subject,submission.grade,submission.category,
            submission.title,approvedFilename,submission.original_name,submission.size,
            submission.content_type||contentTypeFor(submission.original_name),fileData,submission.user_id
          );
        if(submission.answer_key_data){
          saveAnswerKeyRecord(documentId,{
            buffer:Buffer.from(submission.answer_key_data),
            originalname:submission.answer_key_original_name||"answer-key.txt"
          },submission.user_id,normalizedSubmissionAnswerKey);
        }
      }
      notifyUser(submission.user_id,
        decision==="approved"?"document_approved":"document_rejected",
        decision==="approved"?"Tài liệu được duyệt":"Tài liệu chưa được duyệt",
        decision==="approved"?`Tài liệu ${submission.title} của bạn đã được duyệt.`:`Tài liệu ${submission.title} chưa được duyệt.${note?" Lý do: "+note:""}`);
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
await migrateLegacyAnswerKeys();
await normalizeStoredPdfAnswerKeys();

app.listen(port,()=>console.log(`MAI HOC is running at http://localhost:${port}`));
