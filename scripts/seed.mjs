// Seeds the knowledge base with realistic sample sources so RAG has material
// to retrieve on a fresh install. Run: npm run seed
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH =
  process.env.AUTORUNBOOK_DB ||
  path.join(process.cwd(), "data", "autorunbook.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// minimal schema bootstrap (matches src/lib/db.ts)
db.exec(`
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, kind TEXT NOT NULL, content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL, text TEXT NOT NULL);
`);

function chunk(text, size = 1200, overlap = 150) {
  const clean = text.trim();
  if (clean.length <= size) return [clean];
  const out = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    out.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = end - overlap;
  }
  return out;
}

const samples = [
  {
    title: "INC-2291 postmortem — Postgres failover pool exhaustion",
    kind: "incident",
    content: `Incident INC-2291 (2026-05-14, P1, 47 min customer impact)
Summary: After an automated failover from pg-prod-1 to pg-prod-2, the API tier exhausted the pgbouncer connection pool. p99 latency rose from 180ms to 9s; checkout error rate peaked at 22%.
Timeline:
03:02 pg-prod-1 kernel panic, Patroni promoted pg-prod-2.
03:05 pgbouncer on pg-prod-2 hit max_client_conn (200), new connections queued.
03:12 PagerDuty HighLatency fired; on-call engaged.
03:31 pgbouncer max_client_conn raised 200 -> 400 and reloaded (systemctl reload pgbouncer). Latency recovered in 4 min.
Root cause: pg-prod-2's pgbouncer.ini was never synced after the pool size increase on pg-prod-1 (config drift).
Remediation: pgbouncer.ini is now templated in Ansible (roles/pgbouncer); alert added: pgbouncer_waiting_clients > 20 for 5m.
Key commands used:
  psql -h pg-prod-2 -p 6432 -U pgbouncer pgbouncer -c "SHOW POOLS;"
  journalctl -u pgbouncer --since "-30 min"
  systemctl reload pgbouncer`,
  },
  {
    title: "Exchange transport queue drain procedure (KB-114)",
    kind: "doc",
    content: `KB-114: Draining a backed-up Exchange transport queue on EXCH-01/EXCH-02.
Symptoms: mail flow stalled, Get-Queue shows >10k messages, users report delayed mail.
Check queue state:
  Get-Queue -Server EXCH-02 | Sort-Object MessageCount -Descending
  Get-Queue -Identity "EXCH-02\\Submission" | Format-List
Common causes: back-pressure from low disk on the mail.que volume (check with Get-ExchangeDiagnosticInfo -Process EdgeTransport -Component ResourceThrottling), a poison message, or a stuck next-hop.
Safe drain:
  1. Free disk on the queue volume BEFORE touching services (move IIS logs, expand disk).
  2. Restart transport only if back-pressure has cleared: Restart-Service MSExchangeTransport
  3. Retry queues: Get-Queue -Server EXCH-02 | Retry-Queue
  4. If a single message poisons the queue: Get-Message -Server EXCH-02 -ResultSize 50 | Sort-Object Size -Descending, then Remove-Message -Identity <id> -WithNDR $false
Never delete the mail.que database while the transport service is running.
Validation: Get-Queue MessageCount trending to 0, test mail round-trip via Test-Mailflow.`,
  },
  {
    title: "Grafana alert definitions — host memory & disk",
    kind: "alert",
    content: `Alert: HighMemoryUsage — expr: node_memory_used_percent > 92 for 15m. Severity: high.
Standard response: identify top consumers (ps aux --sort=-%mem | head -15), check for memory leaks in app services, consider systemctl restart of the leaking unit during low traffic. Hosts web-01..web-06 run nginx + the node app under systemd unit "webapp".
Alert: DiskAlmostFull — expr: node_filesystem_avail_bytes/node_filesystem_size_bytes < 0.08 for 10m. Severity: critical for / and /var.
Standard response: du -xh --max-depth=2 /var | sort -rh | head, clear journald (journalctl --vacuum-size=500M), rotate/compress app logs, expand the LVM volume if recurring (lvextend -r -L +10G).
Escalation: if an alert flaps 3+ times in 24h, open a problem ticket instead of re-acking.`,
  },
  {
    title: "CHG-9912 — HAProxy 2.6 to 2.9 upgrade runsheet",
    kind: "change_request",
    content: `Change CHG-9912: upgrade HAProxy from 2.6 to 2.9 on lb-1 and lb-2 (keepalived active/passive pair, VIP 10.0.0.10).
Window: Saturday 02:00-04:00 UTC. Impact: sub-second connection resets during reload; no expected downtime if done one node at a time.
Procedure summary: upgrade the PASSIVE node first, verify config compatibility (haproxy -c -f /etc/haproxy/haproxy.cfg), fail the VIP over (systemctl stop keepalived on active), upgrade the second node, fail back.
Rollback: apt install haproxy=2.6.* --allow-downgrades, restore /etc/haproxy from the pre-change backup tarball in /root/chg9912-backup.tgz, systemctl restart haproxy.
Validation: echo "show info" | socat /run/haproxy/admin.sock - shows Version 2.9; error rate on the LB dashboard flat; synthetic checks green for 30 min.`,
  },
];

const insSource = db.prepare(
  "INSERT INTO sources (title, kind, content) VALUES (?, ?, ?)"
);
const insChunk = db.prepare(
  "INSERT INTO chunks (source_id, ord, text) VALUES (?, ?, ?)"
);

const existing = db.prepare("SELECT count(*) AS n FROM sources").get().n;
if (existing > 0) {
  console.log(`Knowledge base already has ${existing} sources — skipping seed.`);
  process.exit(0);
}

const tx = db.transaction(() => {
  for (const s of samples) {
    const id = insSource.run(s.title, s.kind, s.content).lastInsertRowid;
    chunk(s.content).forEach((c, i) => insChunk.run(id, i, c));
  }
});
tx();
console.log(`Seeded ${samples.length} knowledge-base sources into ${DB_PATH}`);
