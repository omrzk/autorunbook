"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Toast from "@/components/Toast";

const KINDS = [
  { value: "incident", label: "Incident report", hint: "Post-incident notes, timeline, symptoms" },
  { value: "powershell", label: "PowerShell script", hint: "A script to document as a procedure" },
  { value: "logs", label: "Log excerpt", hint: "Application / system / event logs" },
  { value: "ticket", label: "Ticket", hint: "ServiceNow, Jira, Zendesk ticket text" },
  { value: "alert", label: "Monitoring alert", hint: "PagerDuty, Grafana, Zabbix, SCOM alert" },
  { value: "email", label: "Email thread", hint: "Escalation or outage email chain" },
  { value: "change_request", label: "Change request", hint: "Planned change / RFC to proceduralize" },
];

const PLACEHOLDERS: Record<string, string> = {
  incident:
    "e.g.\n2026-07-01 03:12 UTC — Payment API p99 latency spiked to 9s.\nRoot cause: connection pool exhaustion on pg-prod-2 after failover...\nResolution: restarted pgbouncer, raised max_client_conn to 400...",
  powershell:
    'e.g.\n# Rotate IIS logs and restart app pool\nImport-Module WebAdministration\nGet-ChildItem "C:\\inetpub\\logs" -Recurse | Where-Object ...',
  logs:
    "e.g.\n2026-07-01T03:11:58Z pg-prod-2 pgbouncer[112]: ERROR accept() failed: too many open connections\n2026-07-01T03:12:02Z api-7 app: TimeoutError: connection pool exhausted...",
  ticket:
    "e.g.\nINC0048291 — Users in EU region cannot log in via SSO.\nPriority: P1. Assignment group: Identity Ops...",
  alert:
    "e.g.\n[FIRING] HighMemoryUsage — host=web-04 memory_used > 92% for 15m\nRunbook: none. Dashboard: grafana.local/d/hosts...",
  email:
    "e.g.\nFrom: NOC\nSubject: URGENT — Exchange queue backlog 40k messages\nWe are seeing mail flow stopped on EXCH-02 since 02:40...",
  change_request:
    "e.g.\nCHG0009912 — Upgrade HAProxy 2.6 → 2.9 on lb-1/lb-2\nWindow: Sat 02:00–04:00 UTC. Impact: brief connection resets during reload...",
};

export default function NewRunbook() {
  const router = useRouter();
  const [kind, setKind] = useState("incident");
  const [content, setContent] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  const generate = async () => {
    if (!content.trim()) {
      setToast({ msg: "Paste some input material first", error: true });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, content, instructions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      router.push(`/runbooks/${data.id}`);
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : String(e), error: true });
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Generate a runbook</h1>
          <p className="sub">
            The AI grounds the runbook in your input plus the most relevant
            documents retrieved from the knowledge base (RAG).
          </p>
        </div>
      </div>

      <div className="card card-pad" style={{ maxWidth: 860 }}>
        <div className="field">
          <label className="label">Input type</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                className="btn sm"
                onClick={() => setKind(k.value)}
                title={k.hint}
                style={
                  kind === k.value
                    ? {
                        background: "var(--accent-soft)",
                        borderColor: "var(--accent)",
                        color: "var(--accent)",
                      }
                    : undefined
                }
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="label">Input material</label>
          <textarea
            className="textarea"
            rows={13}
            placeholder={PLACEHOLDERS[kind]}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="label">
            Additional instructions <span style={{ fontWeight: 400, color: "var(--text-3)" }}>(optional)</span>
          </label>
          <input
            className="input"
            placeholder='e.g. "target audience is L1 helpdesk", "include AWS CLI variants"'
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </div>

        <button className="btn primary" onClick={generate} disabled={busy}>
          {busy ? (
            <>
              <span className="spinner" /> Generating — retrieving context and
              drafting…
            </>
          ) : (
            "Generate runbook"
          )}
        </button>
      </div>
      {toast && (
        <Toast message={toast.msg} error={toast.error} onDone={() => setToast(null)} />
      )}
    </>
  );
}
