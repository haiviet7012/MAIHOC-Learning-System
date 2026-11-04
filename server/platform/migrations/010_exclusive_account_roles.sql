-- users.role/admin_level is authoritative. School membership must agree with it.
CREATE FUNCTION account_school_role(account_role TEXT, level BIGINT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN account_role='admin' AND level>=2 THEN 'school_admin'
             WHEN account_role='admin' AND level>=1 THEN 'teacher' ELSE 'student' END
$$;

CREATE FUNCTION align_account_role() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE effective_role TEXT := account_school_role(NEW.role, NEW.admin_level);
BEGIN
 IF effective_role <> 'student' THEN
  DELETE FROM school_class_members WHERE user_id=NEW.id;
  DELETE FROM school_class_leave_requests WHERE student_id=NEW.id;
  UPDATE student_enrollments SET status='ended',ended_at=now() WHERE student_id=NEW.id AND status='active';
 END IF;
 IF effective_role <> 'teacher' THEN
  DELETE FROM school_teacher_assignments WHERE teacher_id=NEW.id;
  DELETE FROM teacher_course_assignments WHERE teacher_id=NEW.id;
 END IF;
 -- Preserve existing school-scoped administration for teachers. This grants no student role.
 UPDATE school_memberships SET role=effective_role WHERE user_id=NEW.id AND role<>effective_role
  AND NOT (effective_role='teacher' AND role='school_admin');
 RETURN NEW;
END $$;
CREATE TRIGGER users_exclusive_role AFTER UPDATE OF role,admin_level ON users
 FOR EACH ROW EXECUTE FUNCTION align_account_role();
-- Repair previously conflicting assignments with the same procedure.
UPDATE users SET role=role;

CREATE FUNCTION check_account_assignment_role() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE uid BIGINT; expected TEXT; actual TEXT;
BEGIN
 IF TG_TABLE_NAME='school_class_members' THEN uid=NEW.user_id; expected='student';
 ELSIF TG_TABLE_NAME='school_teacher_assignments' THEN uid=NEW.teacher_id; expected='teacher';
 ELSIF TG_TABLE_NAME='school_memberships' THEN uid=NEW.user_id; expected=NEW.role;
 ELSIF TG_TABLE_NAME='student_enrollments' THEN
  IF NEW.status<>'active' THEN RETURN NEW; END IF;
  uid=NEW.student_id; expected='student';
 ELSE uid=NEW.teacher_id; expected='teacher'; END IF;
 -- Lock the account so concurrent promotion cannot leave an incompatible assignment.
 SELECT account_school_role(role,admin_level) INTO actual FROM users WHERE id=uid FOR UPDATE;
 IF actual IS DISTINCT FROM expected AND NOT (
  TG_TABLE_NAME='school_memberships' AND expected='school_admin' AND actual='teacher'
 ) THEN
  RAISE EXCEPTION 'Vai trò không phù hợp với tài khoản; mỗi tài khoản chỉ có một vai trò.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER class_member_account_role BEFORE INSERT OR UPDATE ON school_class_members
 FOR EACH ROW EXECUTE FUNCTION check_account_assignment_role();
CREATE TRIGGER teacher_account_role BEFORE INSERT OR UPDATE ON school_teacher_assignments
 FOR EACH ROW EXECUTE FUNCTION check_account_assignment_role();
CREATE TRIGGER membership_account_role BEFORE INSERT OR UPDATE ON school_memberships
 FOR EACH ROW EXECUTE FUNCTION check_account_assignment_role();
CREATE TRIGGER enrollment_account_role BEFORE INSERT OR UPDATE ON student_enrollments
 FOR EACH ROW EXECUTE FUNCTION check_account_assignment_role();
CREATE TRIGGER course_teacher_account_role BEFORE INSERT OR UPDATE ON teacher_course_assignments
 FOR EACH ROW EXECUTE FUNCTION check_account_assignment_role();
