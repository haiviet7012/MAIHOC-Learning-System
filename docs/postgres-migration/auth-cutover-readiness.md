# PostgreSQL Auth Cutover Readiness — MAI HỌC

## Current state (verified against `main`)

- `server/postgres.js` creates a `pg.Pool` from `DATABASE_URL`.
- `server/migrate-sqlite-to-postgres.js` is an operator-run importer; it is dry-run by default and refuses non-empty PostgreSQL public schema when applying.
- `server/auth.js` still opens `server/data/maihoc.sqlite` with `better-sqlite3` and uses synchronous SQLite-only calls across accounts, sessions, password-reset/email-verification codes, presence and several account-related tables.
- `server/server.js` also uses the same exported SQLite `db` broadly for notifications, learning records, submissions, documents, grading, and other features. Additional modules use SQLite.
- Therefore setting `DATABASE_URL` or importing the schema alone does **not** change runtime storage. Deploying a partial auth-only change without migrating every dependent auth operation and account-related route would risk split-brain data and broken login/account functions.

## Cutover plan

This plan intentionally makes no production DB writes and does not change the runtime database selector.

### 1. Verify target connection without exposing credentials

In Render Dashboard, open the web service linked to this repository and add `DATABASE_URL` from the Render PostgreSQL service's **Internal Database URL** when both services are in the same Render region. Keep it only in Render Environment, never commit it or paste it into issues/logs.

For a local connection, put the URL in `server/.env` (already ignored by git), then from `server/` run:

```powershell
node --env-file=.env .\check-postgres.js
```

Check that the reported database is the intended Render database. Never use a production connection URL in a public log or commit.

### 2. Keep migration tooling in dry-run mode until runtime tests are ready

From `server/`:

```powershell
npm run test:postgres-import
npm run test:postgres-cutover-report
npm run inspect:postgres-cutover
node .\migrate-sqlite-to-postgres.js
```

Review table names/counts and source integrity. Do not add `--apply` until the application-runtime migration is complete, a maintenance window is planned, and all writes to SQLite can be paused. Keep both SQLite files and the verified backup copies.

### 3. Runtime conversion required before authentication cutover

The following operations must use PostgreSQL consistently, not just account creation/login:

- User lookup, registration, password verification, initial-admin provisioning and role/admin-level updates.
- Session creation, validation, expiry cleanup, logout, and session cookie behavior.
- Password-reset token and email-verification code issue/verify/consume flows.
- Presence / online state and any account-related data that has foreign keys to `users`.
- Admin account creation/deletion and user-associated notifications, personal progress, exam history, submissions and AI history.
- Chat, learning-results, test submissions, grading, uploads/document metadata and any modules still using the SQLite `db` object.

Use async `pg` queries with parameter placeholders (`$1`, `$2`, ...), explicit transactions via a checked-out client where multiple writes must be atomic, and PostgreSQL schema migrations. Preserve password hashes (the existing scrypt format is portable) and user IDs/foreign-key relationships. Do not expose session token values; persist only the hash as current code does. Normalize email uniqueness with a case-insensitive unique index or consistently lower-case values.

### 4. Integration tests required

Before production cutover, run automated tests against an isolated PostgreSQL database for:
- New user registration, duplicate email rejection, login success/failure, logout and session expiration.
- Cookie flags under production and local HTTP.
- Password-reset and email OTP flow (send, cooldown, expiry, max attempts, consume-once).
- Initial admin provisioning and prevention of privilege escalation.
- Admin/user routes, notifications and foreign-key cleanup.
- Startup/restart with existing PostgreSQL schema; startup must not auto-drop or overwrite tables.
- Login and account state persist after Render restart and on a second web instance.

### 5. Cutover and rollback

1. Confirm both SQLite backups are readable and retain them.
2. Put the app into maintenance / stop writes.
3. Run the reviewed import once against the intended empty target database, using the exact target database name printed by dry-run and `--confirm-target`.
4. Verify users, document/test counts, foreign keys, and IDs against the source report.
5. Deploy only the tested runtime-migration commit; set `DATABASE_URL` in Render Environment, and restart/redeploy.
6. Smoke-test register/login/logout, password reset, admin access, user account data and the core study flow.
7. Roll back the application deployment and restore the previous service configuration if smoke tests fail. Do not switch back to writing to SQLite after PostgreSQL has accepted new writes unless a controlled reverse-sync/restore plan exists; otherwise the two stores will diverge.

## Status

This document is readiness guidance only. It does not claim that Render was contacted, the import was applied, or the runtime uses PostgreSQL. The current runtime must remain on SQLite until repository-wide runtime conversion and integration tests are completed.
