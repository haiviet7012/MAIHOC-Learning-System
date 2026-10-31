import { pathToFileURL } from "node:url";
import { db, pool } from "../postgres.js";
// Explicit mapping for the current roster only. Historical tests/results are not assigned a guessed year.
export async function bootstrap(
  {
    schoolCode,
    schoolName,
    yearCode,
    startDate,
    endDate,
    adminId,
    apply = false,
  },
  target = db,
) {
  if (
    !schoolCode ||
    !schoolName ||
    !yearCode ||
    !startDate ||
    !endDate ||
    !adminId
  )
    throw new Error(
      "Provide LEGACY_SCHOOL_CODE, LEGACY_SCHOOL_NAME, LEGACY_YEAR_CODE, LEGACY_YEAR_START, LEGACY_YEAR_END, LEGACY_ADMIN_ID.",
    );
  const members = (
    await target.query("SELECT user_id,class_code FROM school_class_members")
  ).rows;
  const duplicates = members.filter((m, i) =>
    members.some((n, j) => j < i && String(n.user_id) === String(m.user_id)),
  );
  if (duplicates.length)
    throw new Error(
      `Resolve multiple legacy classes first: ${duplicates.length} duplicate memberships.`,
    );
  const codes = [
    ...new Set([
      ...members.map((m) => m.class_code),
      ...(
        await target.query("SELECT class_code FROM school_teacher_assignments")
      ).rows.map((r) => r.class_code),
    ]),
  ];
  if (!apply)
    return {
      mode: "preview",
      schoolCode,
      yearCode,
      members: members.length,
      classes: codes.length,
      note: "Only current roster. No historical attempts, grades, IDs or R2 keys are changed.",
    };
  if (
    process.env.NODE_ENV === "production" &&
    process.env.MAIHOC_BACKUP_VERIFIED !== "1"
  )
    throw new Error("Backup restore rehearsal required.");
  return target.transaction(async () => {
    await target.query(
      "SELECT pg_advisory_xact_lock(hashtext('maihoc-legacy-bootstrap'))",
    );
    const existing = (
      await target.query(
        "SELECT value FROM platform_settings WHERE name='legacy_school_id'",
      )
    ).rows[0];
    if (existing)
      throw new Error(
        "Legacy school already mapped. Inspect existing mappings; do not re-bootstrap.",
      );
    const school = (
      await target.query(
        "INSERT INTO schools(code,name) VALUES($1,$2) RETURNING id",
        [schoolCode, schoolName],
      )
    ).rows[0];
    await target.query(
      "INSERT INTO platform_settings(name,value) VALUES('legacy_sync_actor_id',$1)",
      [String(adminId)],
    );
    const year = (
      await target.query(
        "INSERT INTO academic_years(school_id,code,start_date,end_date) VALUES($1,$2,$3,$4) RETURNING id",
        [school.id, yearCode, startDate, endDate],
      )
    ).rows[0];
    await target.query(
      "INSERT INTO school_memberships(school_id,user_id,role) VALUES($1,$2,'school_admin')",
      [school.id, adminId],
    );
    for (const code of codes) {
      const grade = Number(String(code).slice(0, 2));
      if (![10, 11, 12].includes(grade))
        throw new Error(`Unmapped grade for ${code}`);
      const cls = (
        await target.query(
          "INSERT INTO classes(school_id,academic_year_id,class_code,name,grade_level) VALUES($1,$2,$3,$3,$4) RETURNING id",
          [school.id, year.id, code, grade],
        )
      ).rows[0];
      await target.query(
        "INSERT INTO legacy_class_mappings(class_code,school_id,academic_year_id,class_id) VALUES($1,$2,$3,$4)",
        [code, school.id, year.id, cls.id],
      );
      for (const m of members.filter((m) => m.class_code === code)) {
        await target.query(
          "INSERT INTO school_memberships(school_id,user_id,role) VALUES($1,$2,'student') ON CONFLICT DO NOTHING",
          [school.id, m.user_id],
        );
        await target.query(
          "INSERT INTO student_enrollments(school_id,academic_year_id,class_id,student_id,reason,approved_by) VALUES($1,$2,$3,$4,'Legacy current roster mapping',$5)",
          [school.id, year.id, cls.id, m.user_id, adminId],
        );
      }
      for (const t of (
        await target.query(
          "SELECT * FROM school_teacher_assignments WHERE class_code=$1",
          [code],
        )
      ).rows) {
        await target.query(
          "INSERT INTO school_memberships(school_id,user_id,role) VALUES($1,$2,'teacher') ON CONFLICT DO NOTHING",
          [school.id, t.teacher_id],
        );
        await target.query(
          "INSERT INTO teacher_course_assignments(school_id,class_id,teacher_id,subject,kind) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
          [
            school.id,
            cls.id,
            t.teacher_id,
            t.subject || "Chủ nhiệm",
            t.assignment_type,
          ],
        );
      }
    }
    await target.query(
      "INSERT INTO platform_settings(name,value) VALUES('legacy_school_id',$1)",
      [String(school.id)],
    );
    return {
      schoolId: school.id,
      yearId: year.id,
      mappedMemberships: members.length,
    };
  })();
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(
      JSON.stringify(
        await bootstrap({
          schoolCode: process.env.LEGACY_SCHOOL_CODE,
          schoolName: process.env.LEGACY_SCHOOL_NAME,
          yearCode: process.env.LEGACY_YEAR_CODE,
          startDate: process.env.LEGACY_YEAR_START,
          endDate: process.env.LEGACY_YEAR_END,
          adminId: process.env.LEGACY_ADMIN_ID,
          apply: process.argv.includes("--apply"),
        }),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
