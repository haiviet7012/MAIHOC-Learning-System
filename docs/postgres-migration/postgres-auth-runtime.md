# PostgreSQL authentication runtime — staged cutover

## What this change does

When `AUTH_STORAGE=postgres`, the authentication layer uses Render PostgreSQL as the source of truth for:
- account lookup during login;
- account creation and password hashes;
- sessions, session validation, expiration and logout;
- initial Admin provisioning.

Password hashes keep the existing `scrypt$...` format. The public user ID is normalized to a number for compatibility with existing routes. The app validates that `users`, `sessions`, and `user_presence` tables exist before starting.

For now, SQLite is still used by the learning content, notifications, email verification codes, admin dashboards and other legacy modules. Account rows, sessions and online presence are mirrored to SQLite so older code that joins to `users` or checks sessions continues to work during the staged migration. This is a transition adapter, not a claim that all application data has moved to PostgreSQL.

## Safe rollout order

### A. Merge and deploy with the default setting

The code defaults to `AUTH_STORAGE=sqlite`. Deploying the code alone does not switch authentication.

### B. Confirm PostgreSQL contains the imported schema and data

Use the existing, reviewed dry-run/import tooling in `server/migrate-sqlite-to-postgres.js`. If the target is empty and the runtime migration has been merged, stop writes and use the already-documented import apply procedure with the exact database name printed by the dry run.

Do not rerun an apply import into a database that already contains tables. If the previous import was already applied, compare counts and account IDs rather than running the importer again.

### C. Set Render environment variables during a controlled cutover

In the Render web service environment, configure:
- `DATABASE_URL`: the Render PostgreSQL connection string; use the Internal Database URL when the web service and database are in the same Render region.
- `AUTH_STORAGE=postgres`: only after the import is complete and verified.

Do not commit the real connection string. Restart/redeploy during a maintenance window so users are not changing accounts while the SQLite and PostgreSQL snapshots are reconciled.

On startup, the server checks the required PostgreSQL tables, then seeds the SQLite compatibility mirror from PostgreSQL. If SQLite contains an account ID that does not exist in PostgreSQL, startup stops rather than silently dropping or orphaning that account. Resolve the mismatch from the verified source/backup and retry.

### D. Smoke-test before ending maintenance

1. `GET /api/auth/me` returns the expected account or `null`.
2. Log in with the imported Admin account and verify Admin permissions.
3. Register a test user and confirm its ID/email/role exist in PostgreSQL `users` and SQLite mirror `users`.
4. Log out, log in again, and confirm `sessions` are stored in PostgreSQL; test a browser refresh.
5. Reset and change a test user's password and change the test account email. Confirm PostgreSQL `users.password_hash` / `email` reflect those changes.
6. Test admin promotion and deletion using disposable test accounts.
7. Verify chat, online-users, notifications, uploads and learning progress still behave; these legacy features still depend on SQLite.
8. Restart/redeploy and log in again. Do not consider cutover complete until persistence is confirmed.

Example read-only checks in the PostgreSQL SQL console:

```sql
SELECT id, name, email, role, admin_level FROM users ORDER BY id;
SELECT COUNT(*) AS sessions FROM sessions WHERE expires_at > (extract(epoch from now()) * 1000);
SELECT COUNT(*) AS online_presence FROM user_presence;
```

The `expires_at` and `created_at` auth values use Unix milliseconds.

## Rollback

Before PostgreSQL accepts account writes, set `AUTH_STORAGE=sqlite` and restart to return to the prior behavior.

After PostgreSQL accepts registrations, password changes, role changes, or account deletions, do not switch back to SQLite unless you first reconcile those changes. Both stores would otherwise diverge. Keep verified SQLite backups and a database backup from Render.

## Validation limitations

This staged auth path requires successful import and end-to-end verification against the real Render database. GitHub-only source editing cannot validate the user's private database URL or confirm Render login behavior. The code does not write any data to Render until the user deploys it and explicitly sets `AUTH_STORAGE=postgres`.
