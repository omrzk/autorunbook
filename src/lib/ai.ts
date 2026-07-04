import type { RunbookContent } from "./db";
import type { RetrievedChunk } from "./rag";

const SYSTEM_PROMPT = `You are a senior SRE / incident commander writing operational runbooks for production infrastructure teams.

You receive raw operational material (an incident report, PowerShell script, log excerpt, ticket, monitoring alert, email thread, or change request) plus retrieved context from the team's knowledge base.

Produce ONE runbook as a single JSON object with exactly these keys:
{
  "title": string,                      // short, specific, imperative (e.g. "Recover Exchange transport queue backlog")
  "severity": "critical"|"high"|"medium"|"low",
  "tags": string[],                     // 3-6 lowercase tags
  "overview": string,                   // markdown: what this runbook covers, symptoms, scope, when to use it
  "prerequisites": string,              // markdown: access, tools, permissions, safety notes
  "steps": string,                      // markdown: numbered step-by-step procedure. Exact commands in fenced code blocks with language tags. Include expected output/decision points.
  "rollback": string,                   // markdown: numbered rollback procedure to return to the pre-change state, incl. when to trigger it
  "validation": string,                 // markdown: checklist using "- [ ] item" lines verifying the system is healthy
  "communications": string,             // markdown: ready-to-send templates — initial notification, status update, resolution notice. Use placeholders like {{TIME}}, {{IMPACT}}, {{ETA}}.
  "executive_summary": string           // markdown: 4-8 sentences for leadership — plain language, impact, cause, remediation, prevention
}

Rules:
- Ground every step in the provided material and retrieved context; never invent hostnames, IPs, or credentials — use clear placeholders like <SERVER01> when unknown.
- Where retrieved context informed a step, cite it inline like [S1], [S2] matching the context labels.
- Commands must be copy-pasteable and correct for the stated platform (PowerShell for Windows material, bash otherwise).
- Be specific and terse; an on-call engineer at 3am must be able to follow this.
- Respond with ONLY the JSON object. No markdown fences, no commentary.`;

export interface GenerationResult {
  content: RunbookContent;
  model: string;
}

function getProvider() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (anthropicKey) {
    return {
      name: "anthropic" as const,
      key: anthropicKey,
      model: process.env.AUTORUNBOOK_MODEL || "claude-sonnet-5",
    };
  }
  if (openrouterKey) {
    return {
      name: "openrouter" as const,
      key: openrouterKey,
      model: process.env.AUTORUNBOOK_MODEL || "anthropic/claude-sonnet-5",
    };
  }
  throw new Error(
    "No LLM provider configured. Set ANTHROPIC_API_KEY or OPENROUTER_API_KEY (see .env.example)."
  );
}

async function complete(userPrompt: string): Promise<{ text: string; model: string }> {
  const provider = getProvider();

  if (provider.name === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": provider.key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    const text = (data.content || [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("");
    return { text, model: provider.model };
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.key}`,
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: 8000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content ?? "", model: provider.model };
}

export async function generateRunbook(
  inputKind: string,
  inputContent: string,
  context: RetrievedChunk[],
  instructions?: string
): Promise<GenerationResult> {
  // Mock mode: try the full product without an API key (AUTORUNBOOK_MOCK=1)
  if (process.env.AUTORUNBOOK_MOCK === "1") {
    return { content: mockRunbook(inputKind, inputContent, context), model: "mock" };
  }
  const contextBlock =
    context.length > 0
      ? context
          .map(
            (c, i) =>
              `[S${i + 1}] (${c.sourceKind}: ${c.sourceTitle})\n${c.text}`
          )
          .join("\n\n---\n\n")
      : "(knowledge base empty — rely on the input material only)";

  const userPrompt = `## Input material (type: ${inputKind})

${inputContent}

## Retrieved knowledge-base context

${contextBlock}
${instructions ? `\n## Additional operator instructions\n\n${instructions}\n` : ""}
Generate the runbook JSON now.`;

  const { text, model } = await complete(userPrompt);
  return { content: parseRunbookJson(text), model };
}

function mockRunbook(
  inputKind: string,
  inputContent: string,
  context: RetrievedChunk[]
): RunbookContent {
  const firstLine =
    inputContent
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 8) || "operational issue";
  const cites = context.slice(0, 2).map((_, i) => `[S${i + 1}]`).join(" ");
  return {
    title: `Respond to: ${firstLine.slice(0, 70)}`,
    severity: "high",
    tags: [inputKind.replace("_", "-"), "mock", "sample"],
    overview: `**Mock mode is on** (\`AUTORUNBOOK_MOCK=1\`) — no LLM was called. This placeholder shows the full editing, versioning, approval and export pipeline.\n\nThis runbook would cover the ${inputKind.replace("_", " ")} you pasted:\n\n> ${firstLine}`,
    prerequisites: `- Access to the affected systems (SSH / RDP / admin console)\n- On-call escalation contact list\n- \`kubectl\` / \`ssh\` / PowerShell session as appropriate ${cites}`,
    steps: `1. **Acknowledge the alert** and open an incident channel.\n2. **Assess scope** — confirm affected hosts and user impact.\n\n\`\`\`bash\nuptime && df -h && free -m\n\`\`\`\n\n3. **Apply the remediation** appropriate to the findings ${cites}.\n4. **Monitor recovery** for 15 minutes before closing.`,
    rollback: `1. Stop the remediation activity.\n2. Restore the previous configuration from backup.\n3. Restart affected services and re-validate.\n\n> Trigger rollback if error rates increase after step 3.`,
    validation: `- [ ] Alert has cleared in monitoring\n- [ ] Error rate back to baseline\n- [ ] No new related alerts for 15 minutes\n- [ ] Incident channel updated and closed`,
    communications: `**Initial notification**\n\n> We are investigating an issue affecting {{SERVICE}} since {{TIME}}. Impact: {{IMPACT}}. Next update in 30 minutes.\n\n**Resolution notice**\n\n> The issue affecting {{SERVICE}} was resolved at {{TIME}}. Root cause: {{CAUSE}}.`,
    executive_summary: `A ${inputKind.replace("_", " ")} triggered this runbook. Set a real API key (\`ANTHROPIC_API_KEY\` or \`OPENROUTER_API_KEY\`) and disable mock mode to generate grounded, environment-specific procedures using retrieval-augmented generation over your knowledge base.`,
  };
}

/** Parse LLM output into RunbookContent, tolerating fences and stray prose. */
export function parseRunbookJson(text: string): RunbookContent {
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Model did not return JSON. Raw output: " + raw.slice(0, 300));
  }
  raw = raw.slice(start, end + 1);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // repair raw control characters inside string values, a common LLM slip
    parsed = JSON.parse(
      raw.replace(/[\x00-\x1f]/g, (ch) =>
        ch === "\n" ? "\\n" : ch === "\t" ? "\\t" : ""
      )
    );
  }

  const str = (k: string) => (typeof parsed[k] === "string" ? (parsed[k] as string) : "");
  const sev = ["critical", "high", "medium", "low"].includes(parsed.severity as string)
    ? (parsed.severity as RunbookContent["severity"])
    : "medium";

  return {
    title: str("title") || "Untitled runbook",
    severity: sev,
    tags: Array.isArray(parsed.tags)
      ? (parsed.tags as unknown[]).filter((t) => typeof t === "string").slice(0, 8) as string[]
      : [],
    overview: str("overview"),
    prerequisites: str("prerequisites"),
    steps: str("steps"),
    rollback: str("rollback"),
    validation: str("validation"),
    communications: str("communications"),
    executive_summary: str("executive_summary"),
  };
}
