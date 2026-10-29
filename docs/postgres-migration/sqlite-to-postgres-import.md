# SQLite to PostgreSQL data import (MAI HỌC)

This is an operator-run import, not an automatic application database switch. The current app still uses SQLite APIs. Do not point Render web traffic at PostgreSQL until the application runtime has been migrated and tested.

## Before running

1. Stop the local MAI HỌC server.
2. Take verified copies of both data/maihoc.sqlite and data/learning-results.sqlite.
3. Confirm maihoc.sqlite contains exactly one account: ID 1 with role admin. The importer refuses to continue if other accounts remain. It also refuses if learning_results contains rows with user IDs other than 1.
4. Set DATABASE_URL in server/.env or the project root .env. Do not share or commit the connection string.
5. Use a new/empty PostgreSQL database. The importer refuses a target whose public schema already has tables.

## Dry run

From PowerShell in D:\MAIHOC\maihoc-learning-web\server, run:

    node .\migrate-sqlite-to-postgres.js

It checks SQLite integrity, confirms the remaining admin, checks learning-result ownership, connects to PostgreSQL, and prints table/row counts. It does not create or modify PostgreSQL tables.

Check the reported PostgreSQL database name. Ensure the target is the intended Render database and has no application data already in it.

## Apply import

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
