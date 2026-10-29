# MAI HỌC PostgreSQL migration and test-data tools

This folder contains operator-run tools for reviewing SQLite data and importing it into PostgreSQL. Import is never run automatically at application startup.

## Current cutover scope

The branch \`feature/postgres-auth-cutover\` adds a **staged authentication/account cutover**, not a whole-application database rewrite.

When \`MAIHOC_AUTH_BACKEND=postgres\` is explicitly enabled:

- PostgreSQL is authoritative for \`users\`, \`sessions\`, \`user_presence\`, and \`email_verification_codes\`.
- Registration/login, account lookup, password/email updates, admin promotion/creation, session creation/revocation, and email verification use PostgreSQL.
- A local SQLite compatibility mirror is still maintained for \`users\`, \`sessions\`, and \`user_presence\`, because existing chat and other legacy modules read these tables synchronously. Socket.IO session authentication uses PostgreSQL.
- Business/application tables such as documents, tests, attempts, grading, notifications, chat history, and learning results continue to be read/written through SQLite. The existing import script copies their snapshot to PostgreSQL, but the app does not yet use PostgreSQL as their runtime store.

Do **not** describe or treat this as a full-app PostgreSQL migration. Moving the remaining business tables requires a separate repository-wide data access conversion, schema review, and functional tests.

## Files

- \`server/inspect-postgres-cutover.js\`: read-only report of SQLite integrity, row counts, and likely user-owned data.
- \`server/migrate-sqlite-to-postgres.js\`: dry run by default; copies schema/data from both SQLite files only when \`--apply\` and the exact target name are provided.
- \`server/check-postgres-auth.js\`: read-only PostgreSQL check for auth tables, counts, and duplicate email addresses.
- \`server/scripts/preview-k6-users.js\` and \`server/scripts/cleanup-k6-users.js\`: guarded test-data review/cleanup tools.
- \`server/scripts/cleanup-personal-history.js\`: dry-run-first, explicitly confirmed cleanup helper.

## Before importing

Run PowerShell from \`D:\\MAIHOC\\maihoc-learning-web\\server\`.

1. Stop the local server and create verified backups of both \`data\\maihoc.sqlite\` and \`data\\learning-results.sqlite\`.
2. Set \`DATABASE_URL\` privately in \`server/.env\` for local commands, or use the connection string provided in the Render environment. Never commit or paste the real value into logs/issues.
3. Use a **new/empty PostgreSQL database**. The importer refuses to work if schema \`public\` already contains tables.
4. The importer currently requires exactly one source account: \`users.id=1\` and \`role='admin'\`; it also requires the imported \`learning_results\` table to contain only \`user_id=1\`. Never delete real accounts just to satisfy this guard.
5. Run the read-only review and confirm ownership/counts before importing:

   \`\`\`powershell
   npm run inspect:postgres-cutover
   node .\\migrate-sqlite-to-postgres.js
   \`\`\`

6. Confirm that the dry-run \`target.database_name\` is the intended Render database and that counts match the inspected sources.

## Apply the import

Only during an agreed cutover window, after the code PR has been reviewed and the web service's writes have been paused, run:

\`\`\`powershell
node .\\migrate-sqlite-to-postgres.js --apply --confirm-target "EXACT_DATABASE_NAME_FROM_DRY_RUN"
\`\`\`

Replace the placeholder with the exact \`target.database_name\` shown in the dry-run output. This is a data-changing operation. The importer creates tables/indexes, copies rows from both SQLite sources in one PostgreSQL transaction, adds checks/foreign keys, resets identity sequences, and verifies row counts. It never drops or overwrites existing public tables. A non-empty public schema causes it to stop; do not manually drop tables to bypass that safeguard.

Then run the read-only preflight:

\`\`\`powershell
npm run check:postgres-auth
\`\`\`

The check must pass without missing required auth tables or duplicate email addresses. Compare row counts with the dry-run report; verify the admin row with a query that does not expose password hashes:

\`\`\`sql
SELECT id, name, email, role, admin_level FROM users ORDER BY id;
SELECT COUNT(*) AS users FROM users;
SELECT COUNT(*) AS sessions FROM sessions;
SELECT COUNT(*) AS presence_rows FROM user_presence;
\`\`\`

## Enable PostgreSQL for auth/account runtime

First, review and merge the pull request that contains the staged auth cutover. In Render's **web service Environment** settings, set:

- \`DATABASE_URL\`: use the correct connection string supplied by Render. Do not put it in Git.
- \`MAIHOC_AUTH_BACKEND=postgres\`: enables the staged PostgreSQL-backed authentication/account code.

Keep \`MAIHOC_AUTH_BACKEND=sqlite\` locally unless you specifically want to test the PostgreSQL backend and have a migrated test database. Merely setting \`DATABASE_URL\` does not switch the app; the default backend is deliberately SQLite.

After deploy, check Render logs for the auth-ready message and run a smoke test:

1. Register a dedicated test account, then confirm that it appears in PostgreSQL \`users\`.
2. Log in and confirm the active \`sessions\` count increases. Reload the page and verify \`/api/auth/me\`.
3. Log out and confirm the associated session is removed from PostgreSQL.
4. Verify forgot-password/email verification in the test account and confirm OTP records are stored in PostgreSQL.
5. Confirm admin user listing and Socket.IO chat authentication still work.
6. Verify the existing learning content, tests, submissions, and grading APIs: these still use SQLite and should not be assumed migrated to PostgreSQL.

Do not publish SQL output containing password hashes, session token hashes, OTP hashes, or connection secrets.

## Rollback

If the auth cutover fails, set \`MAIHOC_AUTH_BACKEND=sqlite\` in Render and redeploy the compatible code. The account/session compatibility mirror is maintained during normal auth operations, but pending OTP codes are PostgreSQL-only; after rollback, users should request a new verification code. Keep both SQLite backups and do not delete PostgreSQL tables while diagnosing the issue.

## Remaining work after this staged cutover

A complete PostgreSQL migration still needs to move the remaining SQLite-owned application data access: documents/uploads metadata, tests/submissions, grading and attempts, notifications, learning progress/results, chat conversations/messages, and other modules. That work requires async data-access APIs, PostgreSQL-compatible SQL/types and transactions, row-count/content verification, and integration tests before those runtime tables can safely switch.
