ALTER TABLE question_versions DROP CONSTRAINT question_versions_type_check;
ALTER TABLE question_versions ADD CONSTRAINT question_versions_type_check CHECK(type IN ('multiple_choice','true_false','short_answer','essay'));
