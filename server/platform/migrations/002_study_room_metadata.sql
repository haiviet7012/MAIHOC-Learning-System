CREATE TABLE study_room_metadata (
 id TEXT PRIMARY KEY, creator_id BIGINT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
 creator_name TEXT NOT NULL, password_hash TEXT, created_at BIGINT NOT NULL,
 last_activity_at BIGINT NOT NULL, timer JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX study_room_expiry_idx ON study_room_metadata(last_activity_at);
