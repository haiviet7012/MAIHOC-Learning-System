# MAIHOC Platform Foundation — PR implementation notes

## Scope and compatibility decision

This PR is an additive, low-risk foundation slice based on the approved product/engineering direction and the deeper architecture review. It deliberately does not replace the existing Modular Monolith, PostgreSQL adapter, Cloudflare Worker proxy, Render backend, Cloudflare R2 object keys, authentication/session model, or current School/Learning workflows.

The supplied references describe a staged program, not a single atomic rewrite. The approved target is School-first, two separate product experiences (School and Learning) sharing one identity and backend, and a school-aligned question bank. The safe first implementation therefore hardens production-sensitive behaviour and adds regression protection before schema/domain expansion.

## Confirmed repository baseline

- Frontend remains a Vanilla ES Modules SPA with Montserrat, HTML/CSS, MathJax and current route state.
- Cloudflare Worker serves `dist/` and proxies `/api/*`, `/socket.io/*`, and `/vendor/*` to the Render Node backend using `BACKEND_ORIGIN`.
- Backend remains Node.js >=22.13 / Express 4 with Socket.IO and domain modules.
- PostgreSQL remains the runtime database through `server/postgres.js` and shared `server/db.js` abstraction. SQLite tooling is migration/import tooling, not a parallel runtime database.
- R2 remains object storage through `server/r2-storage.js`; existing `r2_key` values and document IDs are not changed.
- Existing users, sessions, school memberships/assignments, tests/submissions, documents/answer keys, result records and APIs remain in place.

## Changes implemented in this PR

### 1. Password-recovery OTP hardening
- The password-recovery path is explicitly identified as `forgot_password`.
- Recovery OTPs are not printed to application logs.
- Recovery OTPs are not placed in in-app notifications.
- `/api/auth/forgot-password` no longer serializes `devCode`, regardless of SMTP configuration or failure.
- SMTP errors returned to users are generic; SMTP exception detail is not placed in the recovery response.
- Non-recovery account verification behaviour is retained for local development compatibility, while production never exposes `devCode`.

### 2. Presence cleanup removed from request hot paths
- Split cleanup (`DELETE` of expired sessions/presence) from online-user listing.
- `POST /api/presence/ping` and `GET /api/presence/online` now only update/read presence and no longer execute cleanup deletes.
- Added a single process-level cleanup interval (default five minutes) started as part of runtime initialization.
- Timer is `unref()`-ed and guarded against duplicate start; stop helper is exported for controlled shutdown/tests.

### 3. Regression tests and CI gate
- Added `server/tests/platform-foundation.test.js` covering OTP non-disclosure and presence cleanup placement.
- Added `npm run test:platform-foundation`.
- GitHub Actions syntax workflow executes the new platform foundation regression test.

## Explicitly not changed (deferred by design)

- No schema/table/column/ID rename or drop.
- No change to `DATABASE_URL`, PostgreSQL pool, SQL compatibility adapter, user ID, role/check constraints, sessions or cookie contract.
- No move/rename/delete of existing R2 objects; no removal of BYTEA/local fallback yet.
- No changes to document/test IDs or public endpoint paths.
- No Worker proxy or Render deployment topology change.
- No Vite/React migration, no manual dist rewrite and no bulk UI replacement in this foundation PR.
- No replacement of the existing Gemini model list: the report's suggested model names require independent live catalog verification before they can safely become defaults.
- No WebRTC/SFU/Cloudflare Calls cutover. Existing TURN and media flows stay intact until a separate, tested signaling/media PR.
- No migration of in-memory study rooms or AI queue to Redis/pg-boss yet.
- No multi-school, curriculum, question-bank, assessment-attempt or analytics DDL yet.

## Product UI direction recorded for subsequent implementation

The screenshot references point to a school-administration dashboard visual language:
- Deep indigo/purple navigation rail with compact icon + label navigation.
- Light, cool-grey workspace canvas; white content panels; restrained shadows and rounded panels.
- KPI cards, school-performance charts, activity timeline, filterable roster tables and student-profile detail panels.
- Dark-mode counterpart with high-contrast chart surfaces and the same information hierarchy.
- Montserrat remains the product typeface.
- Rebuild by product areas (School portal and Learning portal) while retaining shared authentication, backend APIs and data.
- Responsive layouts and keyboard/contrast states are part of the implementation, not a later visual patch.

The attached screenshots are visual direction only, not a claim that the existing application already contains those screens or data widgets.

## Follow-up PR sequence (recommended)

1. Architecture/domain blueprint: ERD, API contracts, tenant-aware RBAC matrix, data dictionary and migration inventory.
2. Migration framework: version/checksum ledger, lock strategy, pre/postconditions, backup/restore gate and staging rehearsal.
3. Multi-school additive schema: schools, memberships, academic years, terms and dynamic classes; seed/backfill pilot mappings without cutover.
4. Enrollment and teacher/course assignment compatibility adapter.
5. School portal UI shell and role-specific dashboards, preserving current paths/authorization during transition.
6. Curriculum taxonomy and versioned question bank with review/licensing workflow.
7. Assessment/assignment adapters, normalized attempts and per-question answers with legacy JSON dual-read/write.
8. Learning analytics, explainable remediation and governed AI Tutor.
9. Study Rooms 2.0: Socket.IO signaling, persistent room state and a measured SFU adoption gate.

## Verification status

This PR adds static source regression tests and CI execution. It does not access or mutate production PostgreSQL/R2, run a Render deploy, perform data migration, or claim browser E2E/media validation. Before merge/deploy, review the GitHub Actions run, test the Preview, and verify the existing login, school roster, test submit/grading/export, document downloads, Socket.IO and study-room camera/microphone flows against a staging backend.

## Rollback

Rollback is code-only: revert this PR. There is no database migration or R2 object mutation in this PR. A rollback does not require schema downgrade or file restoration.
