# PostgreSQL migration and runtime cutover guide (MAI HỌC)

This folder contains **operator-run tools** and documentation for migrating MAI HỌC from local SQLite files to **PostgreSQL (`pg`)** so that user accounts, login sessions, documents, tests, submissions, grading results, chat history, and notifications persist across Render redeployments.

## Current status of the project

1. **Object Storage (Cloudflare R2)**:
   - Document files, answer-key files, and AI solver history blobs are stored in Cloudflare R2 (`server/r2-storage.js`).
2. **Database Runtime (`server/postgres.js` + Runtime Modules)**:
   - All runtime modules (`server/auth.js`, `server/server.js`, `server/chat.js`, `server/ai-solver/history.js`, `server/ai-solver/routes.js`, `server/tests-module/index.js`, `server/tests-module/results-db.js`) have been migrated from synchronous `better-sqlite3` calls to **asynchronous PostgreSQL (`pg.Pool`)** queries via `server/postgres.js`.
   - Both previous SQLite databases (`maihoc.sqlite` with 22 tables and `learning-results.sqlite` with 2 tables: `subjects_catalog` and `learning_results`) now operate against the single unified PostgreSQL database configured by `DATABASE_URL`.
   - At server startup (`initializeApplicationRuntime()` in `server/server.js`), `initPostgresSchema()` idempotently ensures all 24 tables, indexes (including case-insensitive `LOWER(email)` unique index on `users`), backward-compatible columns, and `IDENTITY` sequences are initialized and synchronized.

## Files

- `server/postgres.js`: PostgreSQL connection pool (`pg`), `AsyncLocalStorage` transaction & savepoint manager, SQLite-to-PostgreSQL SQL dialect adapter (`?` / `@param` -> `$1..$n`, `COLLATE NOCASE` -> `LOWER()`, `INSERT OR IGNORE` -> `ON CONFLICT DO NOTHING`, `MAX(a,b)` -> `GREATEST(a,b)`, `RETURNING id`), and idempotent 24-table schema initializer.
- `server/check-postgres.js`: verifies `DATABASE_URL` connectivity and prints current database name and server timestamp.
- `server/migrate-sqlite-to-postgres.js`: one-time importer that copies schema and existing rows from `data/maihoc.sqlite` and `data/learning-results.sqlite` into an empty PostgreSQL database.
- `server/scripts/preview-k6-users.js` & `server/scripts/cleanup-k6-users.js`: preview and remove synthetic k6 load-test accounts before importing SQLite data.
- `server/tests/postgres-runtime.test.js`: automated tests covering PostgreSQL SQL translation, login/registration/session persistence, sample test seeding, immediate grading, and deferred teacher grading with batch auto-regrade.

## Deployment & Cutover Workflow

### Step 1: Configure `DATABASE_URL`

In `server/.env` (for local testing) and in **Render Dashboard -> Environment** (for production), set:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
```

*(Tip: On Render Web Service, use the **Internal Database URL** for fast, zero-egress connection within the same region; from your local machine, use the **External Database URL**).*

Test the connection from `server/`:

```powershell
npm run check:postgres
```

### Step 2: Optional One-Time Data Import from Existing SQLite Files

If you have existing local SQLite files (`server/data/maihoc.sqlite` and `server/data/learning-results.sqlite`) that you want to copy into a fresh/empty PostgreSQL database before first starting the server:

1. Run a dry-run first:
   ```powershell
   npm run migrate:postgres
   ```
2. Apply the import (using the exact target database name printed in the dry-run report):
   ```powershell
   node .\migrate-sqlite-to-postgres.js --apply --confirm-target <database_name>
   ```
   *(If your SQLite database already has multiple real user accounts that you want to preserve alongside Admin ID 1, pass `--allow-multiple-users`).*

If you are starting on a fresh PostgreSQL database without importing old SQLite files, simply set `ADMIN_EMAIL`, `ADMIN_PASSWORD` (at least 12 characters), and `ADMIN_NAME` in your environment variables—`server.js` will automatically create all 24 tables, seed the initial Admin account (`admin_level = 2`), and seed the sample tests and subjects catalog on startup.

### Step 3: Run Automated Verification Tests

From the project root and `server/` directory:

```powershell
npm test
cd server
npm run test:postgres-import
npm run test:postgres-runtime
```
