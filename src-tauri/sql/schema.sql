-- sites
CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  tags TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);

-- docs (只存元信息，二进制在文件系统)
CREATE TABLE IF NOT EXISTS docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- passwords（敏感字段密文）
CREATE TABLE IF NOT EXISTS passwords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  username TEXT,
  enc_blob BLOB NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sites_url ON sites(url);
CREATE INDEX IF NOT EXISTS idx_docs_filename ON docs(filename);
CREATE INDEX IF NOT EXISTS idx_pw_title ON passwords(title);
