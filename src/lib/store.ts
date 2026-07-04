import { getDb, RunbookContent } from "./db";
import { indexSource } from "./rag";

// ---------- Sources ----------

export function listSources() {
  return getDb()
    .prepare(
      `SELECT s.id, s.title, s.kind, s.created_at,
              length(s.content) AS size,
              (SELECT count(*) FROM chunks c WHERE c.source_id = s.id) AS chunk_count
       FROM sources s ORDER BY s.id DESC`
    )
    .all();
}

export function createSource(title: string, kind: string, content: string) {
  const db = getDb();
  const info = db
    .prepare("INSERT INTO sources (title, kind, content) VALUES (?, ?, ?)")
    .run(title, kind, content);
  const id = Number(info.lastInsertRowid);
  indexSource(id, content);
  return id;
}

export function deleteSource(id: number) {
  getDb().prepare("DELETE FROM sources WHERE id = ?").run(id);
}

// ---------- Runbooks & versions ----------

export interface RunbookRow {
  id: number;
  title: string;
  input_kind: string;
  input_content: string;
  status: string;
  current_version: number;
  created_at: string;
  updated_at: string;
}

export function listRunbooks() {
  return getDb()
    .prepare(
      `SELECT r.id, r.title, r.input_kind, r.status, r.current_version,
              r.created_at, r.updated_at,
              (SELECT count(*) FROM versions v WHERE v.runbook_id = r.id) AS version_count,
              (SELECT json_extract(v.content, '$.severity') FROM versions v
                 WHERE v.runbook_id = r.id AND v.version = r.current_version) AS severity
       FROM runbooks r ORDER BY r.updated_at DESC`
    )
    .all();
}

export function getRunbook(id: number): RunbookRow | undefined {
  return getDb().prepare("SELECT * FROM runbooks WHERE id = ?").get(id) as
    | RunbookRow
    | undefined;
}

export function createRunbook(
  inputKind: string,
  inputContent: string,
  content: RunbookContent,
  sourcesUsed: { id: number; title: string }[],
  author: string
): number {
  const db = getDb();
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        "INSERT INTO runbooks (title, input_kind, input_content) VALUES (?, ?, ?)"
      )
      .run(content.title, inputKind, inputContent);
    const id = Number(info.lastInsertRowid);
    db.prepare(
      `INSERT INTO versions (runbook_id, version, content, author, note, sources_used)
       VALUES (?, 1, ?, ?, 'Initial AI generation', ?)`
    ).run(id, JSON.stringify(content), author, JSON.stringify(sourcesUsed));
    return id;
  });
  return tx();
}

export function getVersion(runbookId: number, version: number) {
  return getDb()
    .prepare("SELECT * FROM versions WHERE runbook_id = ? AND version = ?")
    .get(runbookId, version) as
    | {
        id: number;
        runbook_id: number;
        version: number;
        content: string;
        author: string;
        note: string;
        sources_used: string;
        created_at: string;
      }
    | undefined;
}

export function listVersions(runbookId: number) {
  return getDb()
    .prepare(
      `SELECT version, author, note, created_at FROM versions
       WHERE runbook_id = ? ORDER BY version DESC`
    )
    .all(runbookId);
}

/** Saving an edit always creates a new immutable version and resets approval to draft. */
export function saveNewVersion(
  runbookId: number,
  content: RunbookContent,
  author: string,
  note: string
): number {
  const db = getDb();
  const tx = db.transaction(() => {
    const row = db
      .prepare("SELECT max(version) AS v FROM versions WHERE runbook_id = ?")
      .get(runbookId) as { v: number };
    const next = (row.v || 0) + 1;
    db.prepare(
      `INSERT INTO versions (runbook_id, version, content, author, note, sources_used)
       VALUES (?, ?, ?, ?, ?,
         (SELECT sources_used FROM versions WHERE runbook_id = ? AND version = ?))`
    ).run(runbookId, next, JSON.stringify(content), author, note, runbookId, row.v);
    db.prepare(
      `UPDATE runbooks SET title = ?, current_version = ?, status = 'draft',
        updated_at = datetime('now') WHERE id = ?`
    ).run(content.title, next, runbookId);
    return next;
  });
  return tx();
}

export function rollbackToVersion(runbookId: number, version: number, actor: string): number {
  const v = getVersion(runbookId, version);
  if (!v) throw new Error(`Version ${version} not found`);
  const content = JSON.parse(v.content) as RunbookContent;
  return saveNewVersion(
    runbookId,
    content,
    actor,
    `Restored from v${version}`
  );
}

export function deleteRunbook(id: number) {
  getDb().prepare("DELETE FROM runbooks WHERE id = ?").run(id);
}

// ---------- Approval workflow ----------

const TRANSITIONS: Record<string, { from: string[]; to: string }> = {
  submitted: { from: ["draft", "rejected"], to: "in_review" },
  approved: { from: ["in_review"], to: "approved" },
  rejected: { from: ["in_review"], to: "rejected" },
  changes_requested: { from: ["in_review"], to: "draft" },
  reopened: { from: ["approved", "rejected"], to: "draft" },
};

export function applyApprovalAction(
  runbookId: number,
  action: string,
  actor: string,
  note: string
) {
  const db = getDb();
  const rb = getRunbook(runbookId);
  if (!rb) throw new Error("Runbook not found");
  const t = TRANSITIONS[action];
  if (!t) throw new Error(`Unknown action: ${action}`);
  if (!t.from.includes(rb.status)) {
    throw new Error(`Cannot ${action} a runbook in status '${rb.status}'`);
  }
  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO approvals (runbook_id, version, action, actor, note) VALUES (?, ?, ?, ?, ?)"
    ).run(runbookId, rb.current_version, action, actor, note);
    db.prepare(
      "UPDATE runbooks SET status = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(t.to, runbookId);
  });
  tx();
  return t.to;
}

export function listApprovals(runbookId: number) {
  return getDb()
    .prepare(
      "SELECT version, action, actor, note, created_at FROM approvals WHERE runbook_id = ? ORDER BY id DESC"
    )
    .all(runbookId);
}

export function lastApprover(runbookId: number): string | undefined {
  const row = getDb()
    .prepare(
      `SELECT actor FROM approvals WHERE runbook_id = ? AND action = 'approved'
       ORDER BY id DESC LIMIT 1`
    )
    .get(runbookId) as { actor: string } | undefined;
  return row?.actor;
}
