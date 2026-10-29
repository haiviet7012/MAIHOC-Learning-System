-- Read-only PostgreSQL preflight. This does not create or modify tables.
SELECT current_database() AS database_name, current_user AS database_user, now() AS server_time;
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, table_name;
