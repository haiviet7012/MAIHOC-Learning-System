# PostgreSQL migration and k6 test-data cleanup

This folder contains **operator-run tools** for inspecting/migrating MAI HỌC data and removing synthetic k6 users without deleting shared learning content.

## Safety model

- Nothing here runs automatically at application startup.
- Always create verified backups of both `maihoc.sqlite` and `learning-results.sqlite` before any operation.
- Never identify test users by role alone. Generate a preview, verify the email patterns and IDs, then pass a reviewed allow-list.
- Shared content tables (documents, tests, answer keys, solution configs) are not deleted by the cleanup script.
- Run the cleanup first against a local copy and verify account/login/content behavior before using a production database.
- This kit does **not** switch the current app to PostgreSQL. The application and its modules still issue SQLite-specific queries. Deploying only `DATABASE_URL` will not migrate the app.

## Files

- `server/scripts/preview-k6-users.js`: read-only preview for accounts matching explicit email/name patterns.
- `server/scripts/cleanup-k6-users.js`: dry-run by default; requires `--apply` and a reviewed user-id allow-list to delete test users from both SQLite databases.
- `postgres-preflight.sql`: checks that the PostgreSQL connection works and prints current schema/table inventory.
- `README.md`: operator workflow.

## Cleanup preview

Run in PowerShell from `D:\\MAIHOC\\maihoc-learning-web\\server` after taking a backup:

```powershell
node .\\scripts\\preview-k6-users.js --db .\\data\\maihoc.sqlite --email-regex '(?i)(k6|loadtest|load-test|grafana|vu[0-9]+|testuser[0-9]+)'
```

Review the full candidate list. If the test emails use a different pattern, adjust the regex and inspect each candidate. The preview never deletes data.

## Cleanup (dry-run first)

```powershell
node .\\scripts\\cleanup-k6-users.js --main-db .\\data\\maihoc.sqlite --results-db .\\data\\learning-results.sqlite --user-ids 12,13,14
```

This reports rows that would be removed. The user IDs above are examples only; replace them with **reviewed IDs from your own preview**. It does not apply changes unless `--apply` is supplied.

After reviewing the dry-run output and verifying backups:

```powershell
node ..\\scripts\\cleanup-k6-users.js --main-db .\\data\\maihoc.sqlite --results-db .\\data\\learning-results.sqlite --user-ids 12,13,14 --apply
```

The script verifies that:
- at least one admin remains;
- no admin ID is in the deletion allow-list;
- each target ID exists;
- both SQLite changes commit as individual transactions (two separate database files cannot share one SQLite transaction).

Run first on copies. If one database transaction fails after the other has committed, restore both backup files and rerun after fixing the problem.

## PostgreSQL connection preflight

After setting `DATABASE_URL` locally (do not commit it), run:

```powershell
node --env-file=.env .\\check-postgres.js
```

To inspect PostgreSQL without changing data, connect with your provider's SQL console and run `postgres-preflight.sql`. A successful connection does not mean the application has been migrated.

## Required remaining application work

The current code uses SQLite APIs (`db.prepare`, `db.exec`, `db.pragma`, and synchronous transactions) throughout `auth.js`, `server.js`, `chat.js`, `tests-module`, and other modules. A correct PostgreSQL migration needs a repository-wide data-access layer or a carefully staged conversion, with schema/type changes, parameter/SQL compatibility changes, transaction handling, ID generation, and integration tests. Do not point production traffic at PostgreSQL until that work is complete and data counts/content checks pass.
