CREATE TABLE school_guardians (
 school_id BIGINT NOT NULL REFERENCES schools(id), student_id BIGINT NOT NULL REFERENCES users(id),
 guardian_id BIGINT NOT NULL REFERENCES users(id), auto_notify BOOLEAN NOT NULL DEFAULT false,
 PRIMARY KEY(school_id,student_id,guardian_id)
);
CREATE TABLE school_management_records (
 id TEXT PRIMARY KEY, school_id BIGINT NOT NULL REFERENCES schools(id), class_id BIGINT,
 kind TEXT NOT NULL CHECK(kind IN ('message','board','event','grade','attendance')),
 student_id BIGINT REFERENCES users(id), record_key TEXT NOT NULL, payload JSONB NOT NULL,
 created_by BIGINT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(school_id,class_id) REFERENCES classes(school_id,id), UNIQUE(school_id,kind,record_key)
);
CREATE INDEX management_class_idx ON school_management_records(school_id,class_id,kind,created_at);
