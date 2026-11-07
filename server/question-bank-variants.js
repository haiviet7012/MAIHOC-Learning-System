import { createHash } from 'node:crypto';
import { generateVariants, seedQuestions, validateQuestion } from '../js/platform/question-bank-model.js';
import { questionFingerprint } from '../js/platform/question-identity.js';
import { canAccessSchool } from '../js/platform/school-access.js';

export async function ensureQuestionBankVariants(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS question_bank_variants (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL, fingerprint_hash TEXT NOT NULL, question JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(user_id,id), UNIQUE(user_id,fingerprint_hash)
  )`);
}
const hash = q => createHash('sha256').update(questionFingerprint(q)).digest('hex');
const failure = (message,status=400) => Object.assign(new Error(message),{status});
function cleanQuestion(input) {
  if (!input || JSON.stringify(input).length > 50000) throw failure('Câu hỏi vượt giới hạn nội dung.');
  try { validateQuestion(input); } catch(error) { throw failure(error.message); }
  return Object.fromEntries(['subject','grade','topic','type','level','stem','choices','answer','solution'].map(key=>[key,input[key] ?? (key==='choices'?[]:'')]));
}
const writable = user => user.role === 'teacher' || user.role === 'admin' && Number(user.adminLevel ?? user.admin_level ?? 0) >= 1;
async function visiblePlatformQuestions(db,user,question) {
  if (!(await db.query("SELECT to_regclass('public.question_versions') AS name")).rows[0].name) return [];
  const schoolIds=(await db.query("SELECT id FROM schools WHERE $2::boolean OR id IN (SELECT school_id FROM school_memberships WHERE user_id=$1 AND status='active') ORDER BY id FOR UPDATE",[user.id,user.role==='admin' && Number(user.adminLevel ?? user.admin_level ?? 0)>=2])).rows.map(row=>row.id);
  return schoolIds.length ? (await db.query("SELECT subject,grade,type,stem,choices FROM question_versions WHERE school_id=ANY($1::bigint[]) AND subject=$2 AND grade::text=$3 AND status<>'archived'",[schoolIds,question.subject,String(question.grade)])).rows : [];
}
export function installQuestionBankVariants(app,{db,requireAuth,requireSameOrigin}) {
  const access = (req,res,next) => canAccessSchool(req.user) ? next() : res.status(403).json({error:'Ngân hàng câu hỏi dành cho School.'});
  const staff = (req,res,next) => writable(req.user) ? next() : res.status(403).json({error:'Chỉ giáo viên hoặc quản trị viên được lưu câu hỏi.'});
  const wrap = fn => (req,res,next)=>Promise.resolve(fn(req,res)).catch(error=>error.status?res.status(error.status).json({error:error.message}):next(error));
  app.get('/api/question-bank/variants',requireAuth,access,wrap(async(req,res)=>{
    res.setHeader('Cache-Control','private, no-store');
    res.json({items:(await db.query('SELECT question FROM question_bank_variants WHERE user_id=$1 ORDER BY created_at DESC,id',[req.user.id])).rows.map(row=>row.question)});
  }));
  app.post('/api/question-bank/variants',requireSameOrigin,requireAuth,access,staff,wrap(async(req,res)=>{
    const source=cleanQuestion(req.body.source), fingerprints=req.body.existingFingerprints || [];
    if (!Array.isArray(fingerprints) || fingerprints.length>5000 || fingerprints.some(key=>typeof key!=='string' || key.length>50000)) throw failure('Danh sách chống trùng không hợp lệ.');
    const result=await db.transaction(async()=>{
      // Serializes simultaneous clicks/tabs for the same bank; the unique index is the final guard.
      await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);
      const stored=(await db.query('SELECT question FROM question_bank_variants WHERE user_id=$1',[req.user.id])).rows.map(row=>row.question);
      const seen=new Set([...seedQuestions(req.user.id),source,...stored].map(questionFingerprint).concat(fingerprints));
      // Reuse the merged identity rules against the platform bank visible to this account.
      for(const q of await visiblePlatformQuestions(db,req.user,source)) seen.add(questionFingerprint(q));
      const candidates=generateVariants(source),items=[];
      for (const candidate of candidates) {
        const key=questionFingerprint(candidate); if(seen.has(key)) continue; seen.add(key);
        const question={...candidate,owner:req.user.id,author:req.user.name,status:'approved',reviewer:'Tự động lưu từ nhân bản AI',ai:true,autoSaved:true};
        const inserted=await db.query('INSERT INTO question_bank_variants(user_id,id,fingerprint_hash,question) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,fingerprint_hash) DO NOTHING RETURNING question',[req.user.id,question.id,hash(question),JSON.stringify(question)]);
        if(inserted.rows.length) items.push(inserted.rows[0].question);
      }
      return {items,skipped:candidates.length-items.length};
    })();
    res.status(201).json(result);
  }));
  app.patch('/api/question-bank/variants/:id',requireSameOrigin,requireAuth,access,staff,wrap(async(req,res)=>{
    const changes=cleanQuestion(req.body);
    const updated=await db.transaction(async()=>{
      await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);
      const rows=(await db.query('SELECT id,question FROM question_bank_variants WHERE user_id=$1',[req.user.id])).rows;
      const original=rows.find(row=>row.id===req.params.id); if(!original) throw failure('Không tìm thấy câu hỏi.',404);
      const question={...original.question,...changes};
      if([...seedQuestions(req.user.id),...await visiblePlatformQuestions(db,req.user,question),...rows.filter(row=>row.id!==req.params.id).map(row=>row.question)].some(q=>questionFingerprint(q)===questionFingerprint(question))) throw failure('Câu hỏi đã có trong kho (trùng nội dung và phương án).',409);
      await db.query('UPDATE question_bank_variants SET question=$3,fingerprint_hash=$4 WHERE user_id=$1 AND id=$2',[req.user.id,req.params.id,JSON.stringify(question),hash(question)]);
      return question;
    })();res.json({question:updated});
  }));
  app.delete('/api/question-bank/variants/:id',requireSameOrigin,requireAuth,access,staff,wrap(async(req,res)=>{
    const result=await db.query('DELETE FROM question_bank_variants WHERE user_id=$1 AND id=$2 RETURNING id',[req.user.id,req.params.id]);
    if(!result.rows.length) throw failure('Không tìm thấy câu hỏi.',404);
    res.json({ok:true});
  }));
}
