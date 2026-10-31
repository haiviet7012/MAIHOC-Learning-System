ALTER TABLE assessment_assignments ADD COLUMN student_id BIGINT REFERENCES users(id);
ALTER TABLE assessment_assignments ADD COLUMN is_practice BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX assignment_personal_idx ON assessment_assignments(school_id,student_id) WHERE student_id IS NOT NULL;
