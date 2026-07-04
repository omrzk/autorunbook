import { getDb } from "./db";

/**
 * Lightweight self-hosted RAG: sources are chunked on ingest and retrieved
 * with BM25 (Okapi) at generation time. No external vector service needed,
 * which keeps the tool fully self-contained; swap in an embedding store by
 * replacing `retrieve` if you need semantic recall across huge corpora.
 */

const CHUNK_SIZE = 1200; // chars
const CHUNK_OVERLAP = 150;

export function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= CHUNK_SIZE) return [clean];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_SIZE, clean.length);
    if (end < clean.length) {
      // prefer to break on a paragraph, then a line, then a sentence
      const window = clean.slice(start, end);
      const breakAt = Math.max(
        window.lastIndexOf("\n\n"),
        window.lastIndexOf("\n"),
        window.lastIndexOf(". ")
      );
      if (breakAt > CHUNK_SIZE * 0.4) end = start + breakAt + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks.filter((c) => c.length > 0);
}

export function indexSource(sourceId: number, content: string) {
  const db = getDb();
  db.prepare("DELETE FROM chunks WHERE source_id = ?").run(sourceId);
  const insert = db.prepare(
    "INSERT INTO chunks (source_id, ord, text) VALUES (?, ?, ?)"
  );
  const tx = db.transaction((parts: string[]) => {
    parts.forEach((text, ord) => insert.run(sourceId, ord, text));
  });
  tx(chunkText(content));
}

// ---------- BM25 retrieval ----------

const STOP = new Set(
  "a an the and or of to in on for with at by is are was were be been it its this that from as we you i not no if then else".split(
    " "
  )
);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_.-]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export interface RetrievedChunk {
  chunkId: number;
  sourceId: number;
  sourceTitle: string;
  sourceKind: string;
  text: string;
  score: number;
}

export function retrieve(query: string, topK = 6): RetrievedChunk[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.id, c.source_id, c.text, s.title, s.kind
       FROM chunks c JOIN sources s ON s.id = c.source_id`
    )
    .all() as {
    id: number;
    source_id: number;
    text: string;
    title: string;
    kind: string;
  }[];
  if (rows.length === 0) return [];

  const qTerms = tokenize(query);
  if (qTerms.length === 0) return [];

  const docs = rows.map((r) => tokenize(r.text));
  const avgLen = docs.reduce((s, d) => s + d.length, 0) / docs.length;
  const df = new Map<string, number>();
  for (const d of docs) {
    for (const t of new Set(d)) df.set(t, (df.get(t) || 0) + 1);
  }

  const k1 = 1.5;
  const b = 0.75;
  const N = docs.length;

  const scored = rows.map((row, i) => {
    const doc = docs[i];
    const tf = new Map<string, number>();
    for (const t of doc) tf.set(t, (tf.get(t) || 0) + 1);
    let score = 0;
    for (const q of new Set(qTerms)) {
      const f = tf.get(q) || 0;
      if (f === 0) continue;
      const idf = Math.log(1 + (N - (df.get(q) || 0) + 0.5) / ((df.get(q) || 0) + 0.5));
      score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * doc.length) / avgLen));
    }
    return {
      chunkId: row.id,
      sourceId: row.source_id,
      sourceTitle: row.title,
      sourceKind: row.kind,
      text: row.text,
      score,
    };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, topK);
}
