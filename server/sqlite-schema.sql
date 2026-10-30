-- table: account_action_tokens
CREATE TABLE account_action_tokens (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, purpose TEXT NOT NULL, target_email TEXT NOT NULL DEFAULT '', token_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, PRIMARY KEY(user_id,purpose));

-- table: account_deletion_requests
CREATE TABLE account_deletion_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_user_id INTEGER NOT NULL,
    target_name TEXT NOT NULL,
    target_email TEXT NOT NULL,
    target_role TEXT NOT NULL,
    requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    requested_by_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    requested_at TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_at TEXT
  );

-- table: answer_keys
CREATE TABLE answer_keys (
    document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    file_data BLOB NOT NULL,
    source_format TEXT NOT NULL,
    normalized_json TEXT,
    question_ids TEXT,
    grading_available INTEGER NOT NULL DEFAULT 0 CHECK(grading_available IN (0,1)),
    normalization_error TEXT,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
  , r2_key TEXT);

-- table: app_migrations
CREATE TABLE app_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

-- table: chat_conversations
CREATE TABLE chat_conversations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('global', 'direct')),
      title TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

-- table: chat_messages
CREATE TABLE chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

-- table: chat_participants
CREATE TABLE chat_participants (
      conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_read_message_id INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (conversation_id, user_id)
    );

-- table: document_submissions
CREATE TABLE document_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject TEXT NOT NULL, grade TEXT NOT NULL, category TEXT NOT NULL, title TEXT NOT NULL,
    filename TEXT NOT NULL, original_name TEXT NOT NULL, size INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    admin_note TEXT, reviewed_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now')), reviewed_at TEXT
  , file_data BLOB, content_type TEXT NOT NULL DEFAULT 'application/octet-stream', answer_key_data BLOB, answer_key_original_name TEXT, answer_key_content_type TEXT, answer_key_question_ids TEXT, r2_key TEXT, answer_key_r2_key TEXT);

-- table: documents
CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL, grade TEXT NOT NULL, category TEXT NOT NULL, title TEXT NOT NULL,
    filename TEXT NOT NULL, original_name TEXT NOT NULL, size INTEGER NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    file_data BLOB NOT NULL,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
  , answer_key_data BLOB, answer_key_original_name TEXT, answer_key_content_type TEXT, answer_key_question_ids TEXT, r2_key TEXT);

-- table: email_verification_codes
CREATE TABLE email_verification_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL COLLATE NOCASE,
    purpose TEXT NOT NULL,
    target_email TEXT,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

-- table: exam_attempts
CREATE TABLE exam_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id TEXT NOT NULL,
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    grade TEXT NOT NULL,
    category TEXT NOT NULL,
    graded INTEGER NOT NULL DEFAULT 0 CHECK(graded IN (0,1)),
    score REAL,
    scale REAL,
    percent INTEGER,
    correct_count INTEGER,
    question_count INTEGER,
    answers_json TEXT NOT NULL,
    answer_key_json TEXT,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

-- table: exam_solution_reviews
CREATE TABLE exam_solution_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    solution_version INTEGER NOT NULL,
    target_id TEXT NOT NULL,
    decision TEXT NOT NULL CHECK(decision IN ('correct','corrected')),
    before_json TEXT NOT NULL,
    after_json TEXT NOT NULL,
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

-- table: exam_solutions
CREATE TABLE exam_solutions (
    document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','reading','solving','review','ready','failed')),
    progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
    phase TEXT NOT NULL DEFAULT 'queued',
    model TEXT,
    source_hash TEXT,
    generated_json TEXT,
    approved_json TEXT,
    error_code TEXT,
    error_message TEXT,
    solution_version INTEGER NOT NULL DEFAULT 1,
    generated_at TEXT,
    approved_at TEXT,
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

-- table: notifications
CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, link TEXT, read_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

-- table: password_reset_tokens
CREATE TABLE password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

-- table: sessions
CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

-- table: test_submissions
CREATE TABLE test_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT 'Toán',
      grade TEXT NOT NULL DEFAULT '10',
      grading_status TEXT NOT NULL DEFAULT 'pending_grade' CHECK(grading_status IN ('pending_grade', 'graded')),
      graded INTEGER NOT NULL DEFAULT 0 CHECK(graded IN (0, 1)),
      score REAL,
      scale REAL NOT NULL DEFAULT 10,
      percent INTEGER,
      correct_count INTEGER,
      question_count INTEGER,
      duration_minutes INTEGER,
      time_spent_seconds INTEGER,
      auto_submitted_fullscreen INTEGER NOT NULL DEFAULT 0 CHECK(auto_submitted_fullscreen IN (0, 1)),
      answers_json TEXT NOT NULL,
      answer_key_json TEXT,
      result_json TEXT NOT NULL,
      teacher_note TEXT,
      started_at TEXT,
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
      graded_at TEXT,
      graded_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );

-- table: tests
CREATE TABLE tests (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT 'Toán',
      grade TEXT NOT NULL DEFAULT '10',
      open_at TEXT NOT NULL,
      close_at TEXT NOT NULL,
      duration_minutes INTEGER,
      answer_mode TEXT NOT NULL DEFAULT 'immediate' CHECK(answer_mode IN ('immediate', 'deferred')),
      has_answer_key INTEGER NOT NULL DEFAULT 0 CHECK(has_answer_key IN (0, 1)),
      raw_text_cache TEXT,
      questions_json TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

-- table: user_presence
CREATE TABLE user_presence (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    last_seen_at INTEGER NOT NULL
  , activity TEXT NOT NULL DEFAULT 'Đang trực tuyến');

-- table: user_progress
CREATE TABLE user_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL, item_id TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT 'Toán', grade TEXT NOT NULL DEFAULT '10',
    status TEXT NOT NULL DEFAULT 'in_progress',
    progress_percent INTEGER NOT NULL DEFAULT 0 CHECK(progress_percent BETWEEN 0 AND 100),
    score REAL, answers_json TEXT, last_position TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), item_title TEXT NOT NULL DEFAULT '',
    UNIQUE(user_id,item_type,item_id)
  );

-- table: users
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student','teacher','admin')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    admin_level INTEGER NOT NULL DEFAULT 0,
    account_type TEXT NOT NULL DEFAULT 'external'
  );

-- index: account_deletion_requests_status_idx
CREATE INDEX account_deletion_requests_status_idx ON account_deletion_requests(status, requested_at);

-- index: email_verification_user_idx
CREATE INDEX email_verification_user_idx ON email_verification_codes(user_id, purpose, expires_at);

-- index: exam_attempts_document_idx
CREATE INDEX exam_attempts_document_idx ON exam_attempts(user_id, document_id, id DESC);

-- index: exam_attempts_user_created_idx
CREATE INDEX exam_attempts_user_created_idx ON exam_attempts(user_id, created_at DESC);

-- index: idx_chat_conversations_updated
CREATE INDEX idx_chat_conversations_updated ON chat_conversations(updated_at DESC);

-- index: idx_chat_messages_conv
CREATE INDEX idx_chat_messages_conv ON chat_messages(conversation_id, id DESC);

-- index: idx_chat_participants_user
CREATE INDEX idx_chat_participants_user ON chat_participants(user_id, conversation_id);

-- index: notifications_user_idx
CREATE INDEX notifications_user_idx ON notifications(user_id, read_at, id DESC);

-- index: password_reset_expiry_idx
CREATE INDEX password_reset_expiry_idx ON password_reset_tokens(expires_at,user_id);

-- index: sessions_expiry_idx
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

-- index: test_submissions_status_idx
CREATE INDEX test_submissions_status_idx ON test_submissions(grading_status, submitted_at DESC);

-- index: test_submissions_test_user_idx
CREATE INDEX test_submissions_test_user_idx ON test_submissions(test_id, user_id, id DESC);

-- index: tests_open_close_idx
CREATE INDEX tests_open_close_idx ON tests(open_at, close_at);

-- index: user_presence_last_seen_idx
CREATE INDEX user_presence_last_seen_idx ON user_presence(last_seen_at);
