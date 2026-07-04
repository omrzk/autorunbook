"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import Markdown from "@/components/Markdown";
import Toast from "@/components/Toast";

interface RunbookContent {
  title: string;
  severity: string;
  tags: string[];
  overview: string;
  prerequisites: string;
  steps: string;
  rollback: string;
  validation: string;
  communications: string;
  executive_summary: string;
}

const SECTIONS: { key: keyof RunbookContent; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "prerequisites", label: "Prerequisites" },
  { key: "steps", label: "Steps" },
  { key: "rollback", label: "Rollback" },
  { key: "validation", label: "Validation" },
  { key: "communications", label: "Communications" },
  { key: "executive_summary", label: "Exec Summary" },
];

interface ApiData {
  runbook: {
    id: number;
    title: string;
    input_kind: string;
    status: string;
    current_version: number;
    created_at: string;
  };
  version: {
    version: number;
    content: RunbookContent;
    author: string;
    note: string;
    sources_used: { id: number; title: string }[];
    created_at: string;
  };
  versions: { version: number; author: string; note: string; created_at: string }[];
  approvals: { version: number; action: string; actor: string; note: string; created_at: string }[];
}

const ACTION_LABELS: Record<string, string> = {
  submitted: "Submitted for review",
  approved: "Approved",
  rejected: "Rejected",
  changes_requested: "Changes requested",
  reopened: "Reopened",
};

export default function RunbookDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<ApiData | null>(null);
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const [section, setSection] = useState<keyof RunbookContent>("overview");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RunbookContent | null>(null);
  const [saveNote, setSaveNote] = useState("");
  const [actor, setActor] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  const load = useCallback(
    async (v?: number | null) => {
      const q = v ? `?version=${v}` : "";
      const res = await fetch(`/api/runbooks/${id}${q}`);
      if (!res.ok) {
        router.push("/");
        return;
      }
      const d = (await res.json()) as ApiData;
      setData(d);
    },
    [id, router]
  );

  useEffect(() => {
    load(viewVersion);
  }, [load, viewVersion]);

  useEffect(() => {
    setActor(localStorage.getItem("autorunbook-actor") || "");
  }, []);

  const content = editing ? draft : data?.version.content;
  const isCurrent = !!data && data.version.version === data.runbook.current_version;

  const startEdit = () => {
    if (!data) return;
    setDraft(JSON.parse(JSON.stringify(data.version.content)));
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/runbooks/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: draft,
          note: saveNote || "Edited",
          author: actor || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setEditing(false);
      setDraft(null);
      setSaveNote("");
      setViewVersion(null);
      await load(null);
      setToast({ msg: `Saved as v${d.version}` });
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  const approval = async (action: string) => {
    setBusy(true);
    try {
      if (actor) localStorage.setItem("autorunbook-actor", actor);
      const res = await fetch(`/api/runbooks/${id}/approval`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, actor, note: reviewNote }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setReviewNote("");
      await load(viewVersion);
      setToast({ msg: `${ACTION_LABELS[action]} — status: ${d.status.replace("_", " ")}` });
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  const restore = async (v: number) => {
    if (!confirm(`Restore v${v} as a new version?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/runbooks/${id}/rollback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: v, actor }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setViewVersion(null);
      await load(null);
      setToast({ msg: `Restored v${v} as v${d.version}` });
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  const exportUrl = (format: string) =>
    `/api/runbooks/${id}/export?format=${format}&version=${data?.version.version ?? ""}`;

  const statusActions = useMemo(() => {
    if (!data) return [];
    switch (data.runbook.status) {
      case "draft":
        return [{ action: "submitted", label: "Submit for review", cls: "primary" }];
      case "in_review":
        return [
          { action: "approved", label: "Approve", cls: "green" },
          { action: "changes_requested", label: "Request changes", cls: "" },
          { action: "rejected", label: "Reject", cls: "danger" },
        ];
      case "approved":
      case "rejected":
        return [{ action: "reopened", label: "Reopen as draft", cls: "" }];
      default:
        return [];
    }
  }, [data]);

  if (!data || !content) {
    return (
      <div className="empty">
        <span className="spinner dark" />
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          {editing ? (
            <input
              className="input"
              style={{ fontSize: 20, fontWeight: 700, minWidth: 420 }}
              value={draft!.title}
              onChange={(e) => setDraft({ ...draft!, title: e.target.value })}
            />
          ) : (
            <h1>{content.title}</h1>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <span className={`badge sev-${content.severity}`}>{content.severity}</span>
            <span className={`badge st-${data.runbook.status}`}>
              {data.runbook.status.replace("_", " ")}
            </span>
            <span className="badge">
              v{data.version.version}
              {!isCurrent ? " (viewing old)" : ""}
            </span>
            {content.tags.map((t) => (
              <span key={t} className="badge kind">
                {t}
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {!editing && (
            <>
              <a className="btn sm" href={exportUrl("md")}>
                ↓ Markdown
              </a>
              <a className="btn sm" href={exportUrl("html")}>
                ↓ HTML
              </a>
              <a className="btn sm" href={exportUrl("pdf")}>
                ↓ PDF
              </a>
              <a className="btn sm" href={exportUrl("html") + "&inline=1"} target="_blank">
                Preview ↗
              </a>
            </>
          )}
          {editing ? (
            <>
              <button className="btn sm" onClick={() => { setEditing(false); setDraft(null); }}>
                Cancel
              </button>
              <button className="btn sm primary" onClick={saveEdit} disabled={busy}>
                {busy ? <span className="spinner" /> : "Save as new version"}
              </button>
            </>
          ) : (
            isCurrent && (
              <button className="btn sm primary" onClick={startEdit}>
                ✎ Edit
              </button>
            )
          )}
        </div>
      </div>

      {editing && (
        <div className="card card-pad" style={{ marginBottom: 18, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label className="label" style={{ margin: 0 }}>Change note</label>
          <input
            className="input"
            style={{ flex: 1, minWidth: 220 }}
            placeholder="What changed? (stored in version history)"
            value={saveNote}
            onChange={(e) => setSaveNote(e.target.value)}
          />
          <label className="label" style={{ margin: 0 }}>Severity</label>
          <select
            className="select"
            style={{ width: 130 }}
            value={draft!.severity}
            onChange={(e) => setDraft({ ...draft!, severity: e.target.value })}
          >
            {["critical", "high", "medium", "low"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <div className="section-tabs">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                className={`section-tab ${section === s.key ? "active" : ""}`}
                onClick={() => setSection(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="card-pad">
            {editing ? (
              <textarea
                className="textarea"
                rows={22}
                value={(draft![section] as string) || ""}
                onChange={(e) => setDraft({ ...draft!, [section]: e.target.value })}
              />
            ) : (
              <Markdown text={content[section] as string} />
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Approval workflow */}
          <div className="card card-pad">
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>Approval workflow</h3>
            <div className="field">
              <label className="label">Acting as</label>
              <input
                className="input"
                placeholder="your name"
                value={actor}
                onChange={(e) => setActor(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="label">Note</label>
              <input
                className="input"
                placeholder="review note (optional)"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {statusActions.map((a) => (
                <button
                  key={a.action}
                  className={`btn sm ${a.cls}`}
                  disabled={busy}
                  onClick={() => approval(a.action)}
                >
                  {a.label}
                </button>
              ))}
            </div>
            {data.approvals.length > 0 && (
              <ul className="timeline" style={{ marginTop: 14 }}>
                {data.approvals.map((a, i) => (
                  <li key={i}>
                    <div className="t-head">
                      <span>
                        <strong>{ACTION_LABELS[a.action] || a.action}</strong>{" "}
                        <span style={{ color: "var(--text-3)" }}>
                          v{a.version} · {a.actor}
                        </span>
                      </span>
                      <span className="t-date">{a.created_at}</span>
                    </div>
                    {a.note && <div className="t-note">{a.note}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Version history */}
          <div className="card card-pad">
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>Version history</h3>
            <ul className="timeline">
              {data.versions.map((v) => (
                <li key={v.version}>
                  <div className="t-head">
                    <span>
                      <button
                        onClick={() =>
                          setViewVersion(
                            v.version === data.runbook.current_version ? null : v.version
                          )
                        }
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontSize: "inherit",
                          padding: 0,
                          fontWeight: data.version.version === v.version ? 700 : 600,
                          color:
                            data.version.version === v.version
                              ? "var(--accent)"
                              : "var(--text)",
                        }}
                      >
                        v{v.version}
                      </button>{" "}
                      <span style={{ color: "var(--text-3)" }}>· {v.author}</span>
                    </span>
                    <span className="t-date">{v.created_at}</span>
                  </div>
                  <div className="t-note">
                    {v.note}
                    {v.version !== data.runbook.current_version && (
                      <>
                        {" · "}
                        <a
                          style={{ cursor: "pointer" }}
                          onClick={() => restore(v.version)}
                        >
                          restore
                        </a>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Provenance */}
          <div className="card card-pad">
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>Provenance</h3>
            <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.7 }}>
              <div>
                <strong>Input:</strong> {data.runbook.input_kind.replace("_", " ")}
              </div>
              <div>
                <strong>Created:</strong> {data.runbook.created_at}
              </div>
              <div style={{ marginTop: 6 }}>
                <strong>Knowledge-base sources used:</strong>
                {data.version.sources_used.length === 0 ? (
                  <span style={{ color: "var(--text-3)" }}> none (input only)</span>
                ) : (
                  <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                    {data.version.sources_used.map((s) => (
                      <li key={s.id}>{s.title}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {toast && (
        <Toast message={toast.msg} error={toast.error} onDone={() => setToast(null)} />
      )}
    </>
  );
}
