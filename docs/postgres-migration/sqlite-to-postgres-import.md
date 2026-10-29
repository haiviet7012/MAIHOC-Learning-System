# SQLite to PostgreSQL data import (MAI HỌC)

This is an operator-run import, not an automatic application database switch. The current app still uses SQLite APIs. Do not point Render web traffic at PostgreSQL until the application runtime has been migrated and tested.

## Before running

1. Stop the local MAI HỌC server.
2. Take verified copies of both data/maihoc.sqlite and data/learning-results.sqlite.
3. Confirm maihoc.sqlite contains exactly one account: ID 1 with role admin. The importer refuses to continue if other accounts remain. It also refuses if learning_results contains rows with user IDs other than 1.
4. Set DATABASE_URL in server/.env or the project root .env. Do not share or commit the connection string.
5. Use a new/empty PostgreSQL database. The importer refuses a target whose public schema already has tables.

## Read-only cutover data review

Before the import, stop the local server and run a read-only report from the `server` directory:

    npm run inspect:postgres-cutover

The report summarizes row counts, database integrity, foreign-key violations, and counts grouped by detected owner/reference columns (such as `user_id`, `uploaded_by`, and `reviewed_by`). It labels tables as hints for review:
- `ephemeral`: session, presence, reset-token, and verification-token tables.
- `personal_activity_review`: progress, exam attempts, learning results, chats, notifications, and other user activity.
- `user_submissions_review`: pending document/test submissions.
- `shared_content_or_audit`: reusable learning content and review/audit records.
- `review_manually`: tables without a known classification.

These labels are **not deletion instructions**. Inspect the ownership breakdown and decide what to retain. The report does not write to SQLite or PostgreSQL and does not delete any records. It is intended to identify personal or temporary records before the runtime cutover; preserve shared documents, tests, answer keys, and solution-review records unless there is a specific reason to remove them.

Run its unit tests with:

    npm run test:postgres-cutover-report

## Optional personal-history cleanup before cutover

The current source may still have personal activity from admin-led tests even if user accounts other than admin ID 1 have already been removed. If the agreed cutover policy is to clear this activity, first preview it from the `server` directory:

    npm run cleanup:personal-history

The preview requires `users` to contain exactly the one admin account (ID 1), checks integrity and foreign-key health, and shows the affected personal/activity rows plus preserved shared-data counts. It does not modify either database.

Only after reviewing the preview and confirming verified backups are available, apply the explicitly reviewed admin-history cleanup:

    npm run cleanup:personal-history -- --apply --confirm-user-id 1

The script makes SQLite-API backups of both database files before applying. It removes user-specific activity (sessions, presence, progress, exam attempts, learning results, personal chat participation/messages, notifications, and submissions) for the confirmed ID. It does not delete the admin account or shared content tables such as documents, tests, answer keys, exam solutions, and exam-solution review/audit records. The global chat room itself is kept.

SQLite cannot atomically commit across the two database files. If the script reports an apply failure after it starts deleting data, stop and restore **both** SQLite files from the printed pre-cleanup backups before retrying. Do not run this cleanup if those histories should be retained.

## Dry run

From PowerShell in D:\MAIHOC\maihoc-learning-web\server, run:

    node .\migrate-sqlite-to-postgres.js

It checks SQLite integrity, confirms the remaining admin, checks learning-result ownership, connects to PostgreSQL, and prints table/row counts. It does not create or modify PostgreSQL tables.

Check the reported PostgreSQL database name. Ensure the target is the intended Render database and has no application data already in it.

## Apply import

**Recommended sequence:** until a separate application-runtime PR has been merged and is ready to deploy, run only the dry run. If you import now while the site still writes to SQLite, the PostgreSQL copy will immediately become stale. Apply the import during the cutover window, after pausing writes and confirming the runtime migration is ready.

Only after the dry-run report is correct and both SQLite files are backed up, run using the exact database name shown in the report. For a database called maihoc:

    node .\migrate-sqlite-to-postgres.js --apply --confirm-target maihoc

If the printed database name differs, replace maihoc with that exact value. The importer creates tables and indexes, copies rows from both SQLite files in a single PostgreSQL transaction, adds checks and foreign keys, resets identity sequences, and verifies row counts. Existing target tables are never dropped or overwritten.

## Verify after import

Run these queries in the Render PostgreSQL SQL console:

    SELECT id, name, email, role FROM users ORDER BY id;
    SELECT COUNT(*) AS documents FROM documents;
    SELECT COUNT(*) AS tests FROM tests;
    SELECT COUNT(*) AS exam_attempts FROM exam_attempts;
    SELECT COUNT(*) AS learning_results FROM learning_results;
    SELECT COUNT(*) AS result_subjects FROM subjects_catalog;

Verify only admin ID 1 remains and compare counts with the dry-run report. Keep the SQLite files and backups.

## Important limitation

This is only the data/schema import step. server.js, auth.js, chat.js, and the tests module still use SQLite-specific synchronous APIs. A separate runtime migration must convert those repositories/routes to PostgreSQL async calls, then test login, uploads, tests, grading, notifications, chat, and progress. Do not deploy the current SQLite runtime against the imported PostgreSQL schema.
