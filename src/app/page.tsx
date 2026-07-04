"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Toast from "@/components/Toast";

interface RunbookListItem {
  id: number;
  title: string;
  input_kind: string;
  status: string;
  current_version: number;
  version_count: number;
  severity: string | null;
  updated_at: string;
}

const KIND_LABELS: Record<string, string> = {
  incident: "Incident",
  powershell: "PowerShell",
  logs: "Logs",
  ticket: "Ticket",
  alert: "Alert",
  email: "Email",
  change_request: "Change Request",
  doc: "Doc",
};

export default function Dashboard() {
  const [runbooks, setRunbooks] = useState<RunbookListItem[] | null>(null);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/runbooks");
    const data = await res.json();
    setRunbooks(data.runbooks || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: number, title: string) => {
    if (!confirm(`Delete runbook "${title}" and all its versions?`)) return;
    await fetch(`/api/runbooks/${id}`, { method: "DELETE" });
    setToast({ msg: "Runbook deleted" });
    load();
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Runbooks</h1>
          <p className="sub">
            Generated operational runbooks — versioned, reviewable, exportable.
          </p>
        </div>
        <Link href="/new" className="btn primary">
          + Generate runbook
        </Link>
      </div>

      <div className="card">
        {runbooks === null ? (
          <div className="empty">
            <span className="spinner dark" />
          </div>
        ) : runbooks.length === 0 ? (
          <div className="empty">
            <h3>No runbooks yet</h3>
            <p>
              Paste an incident, log excerpt, ticket, alert, email or change
              request and let the AI draft the runbook.
            </p>
            <Link href="/new" className="btn primary" style={{ marginTop: 10 }}>
              Generate your first runbook
            </Link>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Source</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Version</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {runbooks.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/runbooks/${r.id}`} style={{ fontWeight: 600 }}>
                      {r.title}
                    </Link>
                  </td>
                  <td>
                    <span className="badge kind">
                      {KIND_LABELS[r.input_kind] || r.input_kind}
                    </span>
                  </td>
                  <td>
                    {r.severity ? (
                      <span className={`badge sev-${r.severity}`}>{r.severity}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <span className={`badge st-${r.status}`}>
                      {r.status.replace("_", " ")}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-2)" }}>
                    v{r.current_version}
                    {r.version_count > 1 ? (
                      <span style={{ color: "var(--text-3)", fontSize: 12 }}>
                        {" "}
                        · {r.version_count} versions
                      </span>
                    ) : null}
                  </td>
                  <td style={{ color: "var(--text-3)", fontSize: 13 }}>
                    {r.updated_at}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className="btn sm danger"
                      onClick={() => remove(r.id, r.title)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {toast && (
        <Toast message={toast.msg} error={toast.error} onDone={() => setToast(null)} />
      )}
    </>
  );
}
