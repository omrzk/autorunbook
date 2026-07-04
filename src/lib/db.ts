import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH =
  process.env.AUTORUNBOOK_DB ||
  path.join(process.cwd(), "data", "autorunbook.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(d: Database.Database) {
  d.exec(`
  CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN
      ('incident','powershell','logs','ticket','alert','email','change_request','doc')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    ord INTEGER NOT NULL,
    text TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_id);

  CREATE TABLE IF NOT EXISTS runbooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    input_kind TEXT NOT NULL,
    input_content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
      ('draft','in_review','approved','rejected')),
    current_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    runbook_id INTEGER NOT NULL REFERENCES runbooks(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    content TEXT NOT NULL, -- JSON RunbookContent
    author TEXT NOT NULL DEFAULT 'ai',
    note TEXT NOT NULL DEFAULT '',
    sources_used TEXT NOT NULL DEFAULT '[]', -- JSON [{id,title}]
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (runbook_id, version)
  );

  CREATE TABLE IF NOT EXISTS approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    runbook_id INTEGER NOT NULL REFERENCES runbooks(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    action TEXT NOT NULL CHECK (action IN
      ('submitted','approved','rejected','changes_requested','reopened')),
    actor TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_approvals_runbook ON approvals(runbook_id);
  `);
}

// ---------- Types ----------

export type SourceKind =
  | "incident"
  | "powershell"
  | "logs"
  | "ticket"
  | "alert"
  | "email"
  | "change_request"
  | "doc";

export interface RunbookContent {
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  tags: string[];
  overview: string;
  prerequisites: string;
  steps: string;
  rollback: string;
  validation: string;
  communications: string;
  executive_summary: string;
}

export const SECTION_ORDER: {
  key: keyof Omit<RunbookContent, "title" | "severity" | "tags">;
  label: string;
}[] = [
  { key: "overview", label: "Overview" },
  { key: "prerequisites", label: "Prerequisites" },
  { key: "steps", label: "Step-by-Step Procedure" },
  { key: "rollback", label: "Rollback Procedure" },
  { key: "validation", label: "Validation Checklist" },
  { key: "communications", label: "Communication Templates" },
  { key: "executive_summary", label: "Executive Summary" },
];

export const KIND_LABELS: Record<SourceKind, string> = {
  incident: "Incident",
  powershell: "PowerShell",
  logs: "Logs",
  ticket: "Ticket",
  alert: "Monitoring Alert",
  email: "Email",
  change_request: "Change Request",
  doc: "Documentation",
};
