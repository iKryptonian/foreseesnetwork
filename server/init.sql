-- ForeseesNetwork Database Init Script
-- Auto-runs when PostgreSQL container starts for the first time

-- ── USERS TABLE ──
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(22) NOT NULL UNIQUE,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password      VARCHAR(255) NOT NULL,
  avatar        VARCHAR(5),
  created_at    TIMESTAMP DEFAULT NOW(),
  reset_token   VARCHAR(255),
  reset_expires TIMESTAMP
);

-- ── MESSAGES TABLE ──
CREATE TABLE IF NOT EXISTS messages (
  id         SERIAL PRIMARY KEY,
  from_user  VARCHAR(22) NOT NULL,
  to_user    VARCHAR(22) NOT NULL,
  text       TEXT NOT NULL,
  time       VARCHAR(10),
  created_at TIMESTAMP DEFAULT NOW(),
  status     VARCHAR(10) DEFAULT 'sent',
  seq_num    INTEGER,
  acked      BOOLEAN DEFAULT FALSE
);

-- ── MESSAGE SEQUENCES TABLE ──
CREATE TABLE IF NOT EXISTS message_sequences (
  user_pair VARCHAR(50) PRIMARY KEY,
  last_seq  INTEGER DEFAULT 0
);

-- ── INDEXES ──
CREATE INDEX IF NOT EXISTS idx_messages_users   ON messages (from_user, to_user);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages (created_at);
CREATE INDEX IF NOT EXISTS idx_messages_seq     ON messages (from_user, to_user, seq_num);
CREATE INDEX IF NOT EXISTS idx_messages_unacked ON messages (to_user, acked) WHERE acked = FALSE;

-- ── GROUPS TABLE ──
CREATE TABLE IF NOT EXISTS groups (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  created_by VARCHAR(22) NOT NULL,
  avatar     VARCHAR(5),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ── GROUP MEMBERS TABLE ──
CREATE TABLE IF NOT EXISTS group_members (
  group_id  INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  username  VARCHAR(22) NOT NULL,
  role      VARCHAR(10) DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (group_id, username)
);

-- ── GROUP MESSAGES TABLE ──
CREATE TABLE IF NOT EXISTS group_messages (
  id         SERIAL PRIMARY KEY,
  group_id   INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  from_user  VARCHAR(22) NOT NULL,
  text       TEXT NOT NULL,
  time       VARCHAR(10),
  created_at TIMESTAMP DEFAULT NOW(),
  status     VARCHAR(10) DEFAULT 'sent'
);

-- ── GROUP INDEXES ──
CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user   ON group_members(username);