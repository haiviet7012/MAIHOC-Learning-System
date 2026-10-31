-- Transactional compatibility for the single school/year explicitly mapped by bootstrap.
-- Unmapped schools/years never write into the legacy class_code namespace.
CREATE FUNCTION sync_legacy_member_to_enrollment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mapping legacy_class_mappings%ROWTYPE;
DECLARE member_id BIGINT;
DECLARE actor_id BIGINT;
BEGIN
 IF pg_trigger_depth()>1 THEN RETURN NULL; END IF;
 IF TG_OP='DELETE' THEN member_id=OLD.user_id; SELECT * INTO mapping FROM legacy_class_mappings WHERE class_code=OLD.class_code;
 ELSE member_id=NEW.user_id; SELECT * INTO mapping FROM legacy_class_mappings WHERE class_code=NEW.class_code; END IF;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF TG_OP='DELETE' THEN
  UPDATE student_enrollments SET status='ended',ended_at=now() WHERE school_id=mapping.school_id AND class_id=mapping.class_id AND student_id=member_id AND status='active';
 ELSE
  SELECT value::bigint INTO actor_id FROM platform_settings WHERE name='legacy_sync_actor_id';
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Legacy sync actor must be configured by bootstrap'; END IF;
  INSERT INTO school_memberships(school_id,user_id,role) VALUES(mapping.school_id,member_id,'student') ON CONFLICT(school_id,user_id) DO UPDATE SET status='active';
  IF NOT EXISTS(SELECT 1 FROM student_enrollments WHERE school_id=mapping.school_id AND academic_year_id=mapping.academic_year_id AND class_id=mapping.class_id AND student_id=member_id AND status='active') THEN
   UPDATE student_enrollments SET status='ended',ended_at=now() WHERE school_id=mapping.school_id AND academic_year_id=mapping.academic_year_id AND student_id=member_id AND status='active';
   INSERT INTO student_enrollments(school_id,academic_year_id,class_id,student_id,reason,approved_by) VALUES(mapping.school_id,mapping.academic_year_id,mapping.class_id,member_id,'Legacy projection; original approval remains in legacy request records',actor_id);
  END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER legacy_member_projection AFTER INSERT OR DELETE ON school_class_members FOR EACH ROW EXECUTE FUNCTION sync_legacy_member_to_enrollment();
CREATE FUNCTION sync_enrollment_to_legacy_member() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE code TEXT;
BEGIN
 IF pg_trigger_depth()>1 THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM legacy_class_mappings WHERE school_id=NEW.school_id AND academic_year_id=NEW.academic_year_id) THEN RETURN NULL; END IF;
 SELECT class_code INTO code FROM legacy_class_mappings WHERE school_id=NEW.school_id AND class_id=NEW.class_id;
 IF NEW.status='active' THEN
  DELETE FROM school_class_members WHERE user_id=NEW.student_id AND class_code IN(SELECT class_code FROM legacy_class_mappings WHERE school_id=NEW.school_id AND academic_year_id=NEW.academic_year_id) AND (code IS NULL OR class_code<>code);
  IF code IS NOT NULL THEN
   INSERT INTO school_class_members(user_id,class_code) VALUES(NEW.student_id,code) ON CONFLICT(user_id,class_code) DO NOTHING;
   INSERT INTO school_class_join_locks(user_id,class_code) VALUES(NEW.student_id,code) ON CONFLICT(user_id) DO NOTHING;
   UPDATE users SET account_type='school' WHERE id=NEW.student_id;
  END IF;
 ELSIF code IS NOT NULL THEN
  DELETE FROM school_class_members WHERE user_id=NEW.student_id AND class_code=code;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER enrollment_legacy_projection AFTER INSERT OR UPDATE OF status ON student_enrollments FOR EACH ROW EXECUTE FUNCTION sync_enrollment_to_legacy_member();
