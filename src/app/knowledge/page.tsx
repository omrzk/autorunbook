"use client";

import { useCallback, useEffect, useState } from "react";
import Toast from "@/components/Toast";

interface SourceItem {
  id: number;
  title: string;
  kind: string;
  created_at: string;
  size: number;
  chunk_count: number;
}

const KINDS = [
  { value: "incident", label: "Incident" },
  { value: "powershell", label: "PowerShell" },
  { value: "logs", label: "Logs" },
  { value: "ticket", label: "Ticket" },
  { value: "alert", label: "Monitoring Alert" },
  { value: "email", label: "Email" },
  { value: "change_request", label: "Change Request" },
  { value: "doc", label: "Documentation" },
];

const KIND_LABELS = Object.fromEntries(KINDS.map((k) => [k.value, k.label]));

export default function KnowledgeBase() {
  const [sources, setSources] = useState<SourceItem[] | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("doc");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/sources");
    const data = await res.json();
    setSources(data.sources || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!title.trim() || !content.trim()) {
      setToast({ msg: "Title and content are required", error: true });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, kind, content }),
      });
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      setTitle("");
      setContent("");
      setToast({ msg: "Source added and indexed" });
      load();
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    setContent(text);
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const remove = async (id: number, t: string) => {
    if (!confirm(`Remove "${t}" from the knowledge base?`)) return;
    await fetch(`/api/sources?id=${id}`, { method: "DELETE" });
    setToast({ msg: "Source removed" });
    load();
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Knowledge Base</h1>
          <p className="sub">
            Documents here are chunked and indexed; generation retrieves the
            most relevant passages to ground every runbook (RAG).
          </p>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          {sources === null ? (
            <div className="empty">
              <span className="spinner dark" />
            </div>
          ) : sources.length === 0 ? (
            <div className="empty">
              <h3>Knowledge base is empty</h3>
              <p>
                Add past incidents, scripts, tickets, alert definitions and docs
                so generated runbooks reflect <em>your</em> environment.
              </p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Chunks</th>
                  <th>Added</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.title}</td>
                    <td>
                      <span className="badge kind">{KIND_LABELS[s.kind] || s.kind}</span>
                    </td>
                    <td style={{ color: "var(--text-2)" }}>
                      {(s.size / 1024).toFixed(1)} KB
                    </td>
                    <td style={{ color: "var(--text-2)" }}>{s.chunk_count}</td>
                    <td style={{ color: "var(--text-3)", fontSize: 13 }}>{s.created_at}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn sm danger" onClick={() => remove(s.id, s.title)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card card-pad">
          <h3 style={{ fontSize: 16, marginBottom: 16 }}>Add source</h3>
          <div className="field">
            <label className="label">Title</label>
            <input
              className="input"
              placeholder="e.g. INC-2291 postmortem — DB failover"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label">Type</label>
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Content</label>
            <textarea
              className="textarea"
              rows={9}
              placeholder="Paste the document, or load a file below"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          <div className="field">
            <input
              type="file"
              accept=".txt,.md,.log,.ps1,.json,.csv,.yaml,.yml,.xml,.conf,.ini,.sh"
              onChange={(e) => onFile(e.target.files?.[0])}
              style={{ fontSize: 13 }}
            />
          </div>
          <button className="btn primary" onClick={add} disabled={busy} style={{ width: "100%" }}>
            {busy ? <span className="spinner" /> : "Add & index"}
          </button>
        </div>
      </div>
      {toast && (
        <Toast message={toast.msg} error={toast.error} onDone={() => setToast(null)} />
      )}
    </>
  );
}
