import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const gradingDir = path.join(projectRoot, "configs", "grading");
const targetPath = path.join(projectRoot, "configs", "exam-layouts.json");

function sectionMaxPoints(section) {
  const count = Number(section.count) || 0;
  if (section.type === "true_false") {
    const correctStatements = (section.statements || ["a", "b", "c", "d"]).length;
    return count * (Number(section.grading?.pointsByCorrectStatements?.[String(correctStatements)]) || 0);
  }
  return count * (Number(section.grading?.pointsPerCorrect) || 0);
}

function validateProfile(profile, filePath) {
  if (!profile.subject || !profile.grading || !Array.isArray(profile.assessment?.sections)) {
    throw new Error(`${filePath}: thiếu subject, grading hoặc assessment.sections.`);
  }

  for (const section of profile.assessment.sections) {
    if (!(Number(section.count) >= 0) || !section.grading) {
      throw new Error(`${filePath}: section ${section.sectionId || section.order} thiếu count/grading hợp lệ.`);
    }
  }

  const actualQuestionCount = profile.assessment.sections.reduce((sum, section) => sum + (Number(section.count) || 0), 0);
  const actualScore = profile.assessment.sections.reduce((sum, section) => sum + sectionMaxPoints(section), 0);
  if (actualQuestionCount !== Number(profile.assessment.totalQuestions)) {
    throw new Error(`${profile.subject}: tổng số câu trong sections là ${actualQuestionCount}, nhưng totalQuestions=${profile.assessment.totalQuestions}.`);
  }
  if (Math.abs(actualScore - Number(profile.assessment.totalScore)) > 1e-9) {
    throw new Error(`${profile.subject}: tổng điểm tính được là ${actualScore}, nhưng totalScore=${profile.assessment.totalScore}.`);
  }
  if (Math.abs(actualScore - Number(profile.grading.scale)) > 1e-9) {
    throw new Error(`${profile.subject}: tổng điểm ${actualScore} không khớp grading.scale=${profile.grading.scale}.`);
  }
}

if (!fs.existsSync(targetPath)) {
  throw new Error(`Không tìm thấy ${targetPath}. Hãy chạy script từ bản MAIHOC có configs/exam-layouts.json.`);
}

const combined = JSON.parse(fs.readFileSync(targetPath, "utf8"));
combined.schemaVersion ??= 1;
combined.description ??= "Bố cục câu hỏi và quy chế chấm điểm theo từng môn học.";
combined.subjects ??= {};

const files = fs.readdirSync(gradingDir).filter(name => name.endsWith(".json")).sort();
if (!files.length) throw new Error(`Không tìm thấy file JSON trong ${gradingDir}.`);

for (const name of files) {
  const filePath = path.join(gradingDir, name);
  const profile = JSON.parse(fs.readFileSync(filePath, "utf8"));
  validateProfile(profile, name);
  combined.subjects[profile.subject] = {
    grading: profile.grading,
    assessment: profile.assessment
  };
  console.log(`✓ ${profile.subject}: ${profile.assessment.totalQuestions} câu / ${profile.assessment.totalScore} điểm`);
}

fs.writeFileSync(targetPath, `${JSON.stringify(combined, null, 2)}\n`, "utf8");
console.log(`Đã cập nhật ${path.relative(projectRoot, targetPath)}. Các profile môn học khác được giữ nguyên.`);
