# MAIHOC Platform Blueprint v1

**Status:** implementation blueprint; additive-only, no production migration executed.  
**Baseline:** `main` at `fe9e41c624716ee63adeeb95178183eb73dd48eb` (PR #63 merge).  
**Runtime:** Node.js backend on Render; PostgreSQL as the canonical identity/application database; Cloudflare R2 for object storage; Cloudflare Worker serves static `dist/` and proxies backend/Socket.IO.

## 1. Compatibility rules

1. Keep `DATABASE_URL`, current PostgreSQL pool/adapter and the existing identity primary key unchanged.
2. Existing API paths, session cookies, role values, legacy class codes, test/submission payloads and `learning_results.record_key` remain valid.
3. Existing `r2_key` values and R2 objects are immutable identifiers. Do not bulk-copy/delete objects as part of schema rollout.
4. New schema is additive. Legacy endpoints remain adapters until parity tests and the staged frontend are accepted.
5. Do not backfill or assign a school to legacy users/classes by guessing. Unmapped records remain legacy/unassigned until an explicit reviewed mapping exists.
6. No production DDL, data migration, R2 write/delete, or Render deployment is run by this change.

## 2. Target domain model (ERD v1)

- `schools`: tenant root; stable UUID, display name, slug, status, timestamps.
- `academic_years`: belongs to school; label, start/end dates, status.
- `terms`: belongs to academic year; name, sequence, start/end dates.
- `classes`: belongs to school and academic year; code, grade, display name, status. New codes are data, not a fixed enum.
- `school_memberships`: user-to-school relationship, membership role, status, joined/approved timestamps; unique active membership policy to be enforced in service and DB.
- `student_enrollments`: student membership to class, status, effective dates; history-preserving rather than destructive reassignment.
- `course_offerings`: class/term/subject/course delivery instance.
- `teacher_assignments`: teacher membership to course offering, assignment role and dates.
- Later, curriculum taxonomy and assessment entities reference stable IDs from this model; they do not overload `users` or legacy `class_code`.

All tenant-scoped queries must derive tenant context from the authenticated membership and enforce it server-side. A client-supplied `school_id` is never authorization by itself.

## 3. Legacy class mapping

Current UI contains 27 legacy codes: `10A1..10A9`, `11B1..11B9`, `12C1..12C9`. Treat this list as a migration input, not as a permanent domain constraint.

Before any backfill:
1. Query actual class references and distinct codes in staging.
2. Export a reviewed mapping manifest containing source code, target school, academic year, grade, target class ID, row count and reviewer.
3. Reject duplicate target mappings and any unmapped/non-empty source code.
4. Verify counts before and after backfill; retain original legacy code for rollback and reconciliation.
5. Do not infer that all 27 classes belong to one school unless the owner explicitly confirms that mapping.

## 4. Authorization matrix (initial proposal)

- Platform super-admin: platform-wide administration and audited tenant support.
- School admin: manage members, classes, academic years and school-level settings only within their school.
- Teacher: view assigned classes/courses; create assignments and review submissions only in assigned scope.
- Homeroom teacher: manage enrollment requests for assigned class, see that class's roster and progress.
- Student (school): see own profile, own enrollments, assignments and results; no access to other students' private work.
- External student: retain existing independent learning/test access; no implicit membership or school data access.
- Guest: public pages only.

Every new mutation requires server-side role + tenant + resource-scope checks and a negative authorization test. Hiding a UI button is not authorization.

## 5. API evolution

Keep existing endpoints and response contracts in place. Add versioned/grouped endpoints for new domain behavior, with explicit contracts and adapter calls into existing services.

Candidate groups:
- `/api/schools/*`: school list/detail and school-admin settings.
- `/api/school-memberships/*`: invitation, request, approve/reject, revoke.
- `/api/school/classes/*`: dynamic classes and roster.
- `/api/school/courses/*`: course offerings and teacher assignments.
- `/api/school/assignments/*`: assignment adapter over existing test/submission flow.
- `/api/learning/curriculum/*`, `/api/learning/question-bank/*`: versioned content and review.
- `/api/learning/attempts/*`: normalized attempt answers while retaining legacy result export.

Before routes are implemented, capture request/response examples from current server handlers and test the current authorization model. These are proposed namespaces, not claims that endpoints already exist.

## 6. Migration framework requirements

- Ordered immutable migration IDs and SHA-256 checksums.
- PostgreSQL advisory lock; only one runner per database at a time.
- Ledger with started/succeeded/failed status, duration and safe error metadata.
- Preconditions and postconditions; fail closed if an existing migration checksum changes.
- Explicit `--dry-run` and staging-only rehearsal; no automatic production migration on server boot.
- Backup verification and restore rehearsal are release gates, not optional log messages.
- Rollback strategy documented per migration; prefer forward-fix for destructive transformations.
- Never log credentials, OTPs, answer keys for active tests or student-private data.

## 7. Curriculum, question bank and assessment

Curriculum nodes and skills are versioned and aligned to grade/subject/program. Question content is versioned separately from published assessment snapshots. Review workflow: draft → review → approved → published/retired; track source/licensing and editor/audit events.

Assessment adapter initially wraps existing tests, submissions, answer keys, grading engine and subject configs. New normalized `attempt_answers` must dual-write alongside the legacy answer JSON until parity is verified. Published tests pin a question version and scoring-config version; edits cannot silently change past grades.

## 8. Analytics and AI Tutor

Use event/attempt facts to derive skill snapshots, class aggregates and remediation suggestions. AI Tutor retrieval must use approved curriculum/question sources, label generated explanations, retain feedback/audit metadata and apply existing rate limits. Do not make AI output an authoritative answer key without teacher/admin review.

## 9. Study Rooms / media

Keep existing Socket.IO and Worker proxy paths compatible. First stabilize room lifecycle, authorization, signaling diagnostics, reconnect behavior and TURN credential delivery. Test camera/microphone permissions and TURN relay across different networks. Evaluate an SFU only after measured peer-connection limits justify it; do not switch topology based on assumptions.

## 10. Release gates

- Unit/regression and authorization matrix pass.
- PostgreSQL staging migration rehearsal with pre/postcondition checks.
- Backup and restore rehearsal confirmed.
- R2 upload/read/download/delete behavior tested against a non-production bucket/prefix.
- Source/dist parity verified by the build.
- Login, password recovery, document upload, test creation/submission/grading/export and Socket.IO smoke tests pass.
- Browser E2E for desktop/mobile and light/dark themes.
- Load test and rollback/runbook review.
- No production rollout until these gates are signed off.

## 11. Implementation sequence

1. Foundation hardening (merged PR #63).
2. This UI theme + architecture blueprint.
3. Migration runner and CI rehearsal tests.
4. Additive school/academic schema.
5. Dynamic class mapping and membership/enrollment APIs.
6. Teacher assignments, CSV/XLSX import, gradebook.
7. Curriculum taxonomy and reviewed question bank.
8. Assessment adapter and normalized answers.
9. Learning analytics and governed AI Tutor.
10. Study Rooms 2.0 and production-readiness pilot.

The screenshot-driven dashboard is a presentation layer. Domain/API work must remain independently testable and must not couple data authorization to visual navigation.
