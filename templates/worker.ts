/**
 * worker.ts — deployable starting scaffold for the pipeline.
 *
 * The tutor adapts this to the student's spec. Don't paste the whole thing at
 * once — introduce it section by section, ask the student to describe each
 * part before deploying.
 *
 * Structure:
 *   1. Types (Env) — what the Worker has access to
 *   2. fetch handler — HTTP routes (keep/reject/ops)
 *   3. scheduled handler — cron trigger entry point
 *   4. runMainPipeline — the daily work
 *   5. runWatcher — heartbeat checker
 *   6. Helper functions (stubs to replace with real integrations)
 *
 * Deploy (always explicit — CANON § 1.1):
 *   npx wrangler deploy --config wrangler.toml --name my-pipeline
 */

import Anthropic from "@anthropic-ai/sdk";

// =============================================================================
// 1. Types — everything the Worker can access from `env`
// =============================================================================

interface Env {
  // Cloudflare bindings (defined in wrangler.toml)
  PIPELINE_STATE: KVNamespace;
  DB: D1Database;
  // REPORTS: R2Bucket;  // uncomment when using R2 for HTML output

  // Public env vars (in wrangler.toml [vars])
  WORKER_BASE_URL: string;
  TOP_N: string;

  // Secrets (set via `npx wrangler secret put`) — never in wrangler.toml
  ANTHROPIC_API_KEY: string;
  GITHUB_TOKEN: string;        // for reading vault from GitHub
  // Add your output destination secret here:
  // RESEND_API_KEY: string;     // for email via Resend
  // TELEGRAM_BOT_TOKEN: string; // for Telegram output
  // TELEGRAM_CHAT_ID: string;   // your Telegram chat ID
}

// =============================================================================
// 2. HTTP fetch handler — keep/reject endpoints + ops page
// =============================================================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Decision-loop endpoints (lesson 07)
    if (url.pathname.startsWith("/keep/")) {
      const id = url.pathname.slice("/keep/".length);
      const reason = url.searchParams.get("reason") ?? "";
      return logDecision(env, id, "keep", reason);
    }

    if (url.pathname.startsWith("/reject/")) {
      const id = url.pathname.slice("/reject/".length);
      const reason = url.searchParams.get("reason");
      if (reason === null) return rejectForm(id);  // show form first
      return logDecision(env, id, "reject", reason);
    }

    // Ops page — recent runs, heartbeat, decision stats
    if (url.pathname === "/ops") {
      return opsPage(env);
    }

    // Default: confirm the deploy worked
    return new Response(
      `<!doctype html><body style="font-family:system-ui;padding:2rem;line-height:1.5">
        <h1>Your pipeline is running</h1>
        <p>The daily work happens on the scheduled cron. This page is just the public face.</p>
        <ul>
          <li><a href="/ops">/ops</a> — recent runs and decision stats</li>
        </ul>
      </body>`,
      { headers: { "content-type": "text/html; charset=utf-8" } }
    );
  },

  // =============================================================================
  // 3. Scheduled handler — cron trigger entry point
  // =============================================================================

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Two crons defined in wrangler.toml — branch on which fired
    if (event.cron === "0 */4 * * *") {
      return runWatcher(env);
    }
    return runMainPipeline(env);
  },
} satisfies ExportedHandler<Env>;

// =============================================================================
// 4. Main pipeline run — replace the stubs with your real integrations
// =============================================================================

async function runMainPipeline(env: Env): Promise<void> {
  // Idempotency guard (CANON § 2.1) — skip if already ran today
  const today = new Date().toISOString().slice(0, 10);
  const lastRun = await env.PIPELINE_STATE.get("last-run-date");
  if (lastRun === today) {
    console.log("Already ran today — skipping");
    return;
  }

  const runId = crypto.randomUUID();
  const startTs = Date.now();

  try {
    // ── Step 1: gather inputs ────────────────────────────────────────────────
    // Replace fetchInputs() with your real source (see stubs below)
    const inputs = await fetchInputs(env);

    if (inputs.length === 0) {
      console.log("No inputs today — sending empty notice");
      await sendOutput(env, "No new inputs in the last 24 hours. Nothing to surface today.");
      await markSuccess(env, runId, startTs, 0, 0, 0);
      return;
    }

    // ── Step 2: read recent decisions for the learning loop (lesson 07) ──────
    const recentDecisions = await env.DB.prepare(
      `SELECT action, reason, proposal_text FROM decisions ORDER BY ts DESC LIMIT 50`
    ).all<{ action: string; reason: string | null; proposal_text: string }>();

    const decisionsContext = recentDecisions.results
      .map(d => `${d.action.toUpperCase()}: "${d.proposal_text.slice(0, 120)}…" — ${d.reason ?? "(no reason)"}`)
      .join("\n");

    // ── Step 3: call Claude (with prompt caching — lesson 06) ─────────────────
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    const userMessage = [
      `Today's date: ${today}`,
      "",
      `Today's inputs (${inputs.length} items):`,
      inputs.map((item, i) => `[${i + 1}] ${item}`).join("\n\n"),
      "",
      "Your recent decisions on past proposals (most recent first):",
      decisionsContext || "(none yet — this is your first run)",
      "",
      `Produce up to ${env.TOP_N} proposals following your system prompt rules.`,
    ].join("\n");

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      cache_control: { type: "ephemeral" },  // CANON § 3.2 — cache the system prompt
      system: SYSTEM_PROMPT,                  // stable, deterministic — gets cached
      messages: [{ role: "user", content: userMessage }],  // varies — after cache
    });

    // Log token usage for cost monitoring (lesson 09)
    console.log(
      `Claude: ${response.usage.input_tokens} in, ` +
      `${response.usage.output_tokens} out, ` +
      `${response.usage.cache_read_input_tokens ?? 0} cache hit`
    );

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";

    // Sanity check — don't send garbled output (CANON § 3.5)
    if (!text || text.trim().length < 20) {
      console.error("Claude returned empty/short response — aborting this run");
      await markPartial(env, runId, startTs, "claude returned empty response");
      return;
    }

    // ── Step 4: parse proposals, store for keep/reject lookup ──────────────
    const proposals = parseProposals(text);
    await storeProposals(env, proposals);

    // ── Step 5: build and send output ─────────────────────────────────────
    const outputText = renderOutput(proposals, env);
    await sendOutput(env, outputText);

    // ── Step 6: mark success (heartbeat + run log) ──────────────────────────
    await env.PIPELINE_STATE.put("last-run-date", today);
    await markSuccess(
      env, runId, startTs,
      inputs.length,
      proposals.length,
      response.usage.input_tokens + response.usage.output_tokens
    );

  } catch (err) {
    console.error("Pipeline run failed:", err);
    await markFailure(env, runId, startTs, String(err));
    throw err;  // re-throw so Cloudflare sees the failure
  }
}

// =============================================================================
// 5. Heartbeat watcher — checks for silent failure (CANON § 2.3, lesson 08)
// =============================================================================

async function runWatcher(env: Env): Promise<void> {
  const beat = await env.PIPELINE_STATE.get("heartbeat:main");

  if (!beat) {
    console.log("No heartbeat yet — pipeline hasn't completed its first run. Skipping check.");
    return;
  }

  const ageHours = (Date.now() - new Date(beat).getTime()) / 3_600_000;
  console.log(`Heartbeat age: ${ageHours.toFixed(1)}h`);

  if (ageHours > 26) {
    const message = `⚠️ Pipeline hasn't run in ${ageHours.toFixed(1)}h. Last heartbeat: ${beat}`;
    console.error(message);
    await sendAlert(env, message);
    await env.DB.prepare(
      `INSERT INTO health_alerts (id, ts, kind, message) VALUES (?, ?, ?, ?)`
    ).bind(crypto.randomUUID(), new Date().toISOString(), "stale-heartbeat", message).run();
  }
}

// =============================================================================
// 6. System prompt — stable, deterministic, gets cached
// =============================================================================

const SYSTEM_PROMPT = `You are a personal daily brief assistant.

Your job: given a set of inputs the user provides, produce a short curated list of the most useful items for them today.

Rules:
- Return UP TO 3 proposals. Fewer is fine if fewer are relevant. If nothing is relevant, return NO_PROPOSALS_TODAY.
- Each proposal: a body (≤ 300 characters) and a one-sentence "WHY:" explanation.
- Honor the user's recent decisions. Do NOT propose anything similar to items they recently rejected. Lean toward what they've recently kept.
- If you cannot verify a fact from the provided inputs, do not include it. Empty is better than wrong.
- Never add items beyond the top 3, even if there are more good ones. The discipline of choosing matters.

Output format (plain text):

PROPOSAL 1:
<body>
WHY: <one sentence>

PROPOSAL 2:
<body>
WHY: <one sentence>

PROPOSAL 3:
<body>
WHY: <one sentence>

Or, if nothing is relevant: NO_PROPOSALS_TODAY
`;

// =============================================================================
// 7. Stubs — replace these with your real integrations
// =============================================================================

interface Proposal {
  id: string;
  body: string;
  why: string;
}

async function fetchInputs(env: Env): Promise<string[]> {
  // ── REPLACE THIS with your real input source ──────────────────────────────
  //
  // Option A: Readwise highlights
  //   const since = new Date(Date.now() - 86_400_000).toISOString();
  //   const r = await fetch(`https://readwise.io/api/v2/highlights/?updated__gt=${since}`, {
  //     headers: { Authorization: `Token ${env.READWISE_TOKEN}` },
  //   });
  //   const data = await r.json() as any;
  //   return data.results.map((h: any) => `"${h.text}" — ${h.book_title}`);
  //
  // Option B: RSS feed
  //   const r = await fetch("https://your-rss-feed.com/rss.xml");
  //   const xml = await r.text();
  //   // parse XML, extract items...
  //
  // Option C: Obsidian vault notes from GitHub
  //   const r = await fetch(
  //     "https://api.github.com/repos/yourusername/your-vault/contents/Journal",
  //     { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" } }
  //   );
  //   const files = await r.json() as any[];
  //   // filter by date, read recent files...
  //
  // Option D: Notion database
  //   const r = await fetch("https://api.notion.com/v1/databases/DATABASE_ID/query", {
  //     method: "POST",
  //     headers: {
  //       Authorization: `Bearer ${env.NOTION_TOKEN}`,
  //       "Notion-Version": "2022-06-28",
  //       "Content-Type": "application/json",
  //     },
  //     body: JSON.stringify({ filter: { ... } }),
  //   });
  // ─────────────────────────────────────────────────────────────────────────

  // Placeholder until you connect a real source:
  return [
    "PLACEHOLDER: Replace fetchInputs() in worker.ts with your real input source.",
    "Readwise, Notion, RSS, GitHub vault — anything reachable via HTTP.",
  ];
}

async function sendOutput(env: Env, body: string): Promise<void> {
  // ── REPLACE THIS with your real output destination ────────────────────────
  //
  // Option A: Email via Resend (recommended — simple, free tier)
  //   await fetch("https://api.resend.com/emails", {
  //     method: "POST",
  //     headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
  //     body: JSON.stringify({
  //       from: "pipeline@yourdomain.com",  // or use Resend's sandbox domain
  //       to: "your@email.com",
  //       subject: `Daily Brief — ${new Date().toLocaleDateString()}`,
  //       text: body,
  //     }),
  //   });
  //
  // Option B: Telegram bot
  //   await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
  //     method: "POST",
  //     headers: { "Content-Type": "application/json" },
  //     body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: body, parse_mode: "Markdown" }),
  //   });
  //
  // Option C: Write a note back to the vault (via GitHub API)
  //   const fileName = `Pipeline/Output/${new Date().toISOString().slice(0,10)}-brief.md`;
  //   await writeVaultNote(env, fileName, body);
  // ─────────────────────────────────────────────────────────────────────────

  // Placeholder — logs to wrangler tail until you connect a real destination:
  console.log("=== OUTPUT (not yet wired to a real destination) ===");
  console.log(body);
  console.log("=== END OUTPUT ===");
}

async function sendAlert(env: Env, message: string): Promise<void> {
  // ── REPLACE THIS with your alert channel ─────────────────────────────────
  // Use the same channel as sendOutput, but with a clear ALERT subject/prefix.
  // ─────────────────────────────────────────────────────────────────────────
  console.error("=== ALERT (not yet wired) ===");
  console.error(message);
  console.error("=== END ALERT ===");
}

// =============================================================================
// 8. Internal helpers — these don't need to be replaced
// =============================================================================

function parseProposals(text: string): Proposal[] {
  if (text.includes("NO_PROPOSALS_TODAY")) return [];

  const blocks = text.split(/PROPOSAL \d+:/i).filter(b => b.trim().length > 0);
  return blocks.map(block => {
    const whyMatch = block.match(/WHY:\s*(.+)/i);
    const why = whyMatch?.[1]?.trim() ?? "";
    const body = block.replace(/WHY:.+$/im, "").trim();
    return { id: crypto.randomUUID(), body, why };
  });
}

async function storeProposals(env: Env, proposals: Proposal[]): Promise<void> {
  // Store proposal text in KV so keep/reject endpoints can retrieve it (30-day TTL)
  await Promise.all(
    proposals.map(p =>
      env.PIPELINE_STATE.put(`proposal:${p.id}`, JSON.stringify(p), {
        expirationTtl: 60 * 60 * 24 * 30,
      })
    )
  );
}

function renderOutput(proposals: Proposal[], env: Env): string {
  if (proposals.length === 0) {
    return "No proposals today — the pipeline ran but nothing met the bar. Check back tomorrow.";
  }

  const lines = proposals.map((p, i) => {
    const keep = `${env.WORKER_BASE_URL}/keep/${p.id}`;
    const reject = `${env.WORKER_BASE_URL}/reject/${p.id}`;
    return [
      `${i + 1}. ${p.body}`,
      `   → ${p.why}`,
      `   ✅ Keep: ${keep}`,
      `   ❌ Reject: ${reject}`,
    ].join("\n");
  });

  return [
    `Daily Brief — ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`,
    "",
    ...lines,
    "",
    `View run history: ${env.WORKER_BASE_URL}/ops`,
  ].join("\n");
}

async function logDecision(env: Env, proposalId: string, action: "keep" | "reject", reason: string): Promise<Response> {
  const proposalRaw = await env.PIPELINE_STATE.get(`proposal:${proposalId}`);
  const proposal = proposalRaw ? (JSON.parse(proposalRaw) as Proposal) : null;
  const proposalText = proposal?.body ?? "(proposal not found — may have expired)";

  await env.DB.prepare(
    `INSERT INTO decisions (id, ts, proposal_id, proposal_text, action, reason) VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), new Date().toISOString(), proposalId, proposalText, action, reason || null)
    .run();

  const emoji = action === "keep" ? "✅" : "❌";
  const label = action === "keep" ? "Kept" : "Rejected";

  return new Response(
    `<!doctype html><body style="font-family:system-ui;padding:2rem;max-width:32rem;line-height:1.5">
      <h2>${emoji} Logged: ${label}</h2>
      ${reason ? `<p>Reason: <em>${escapeHtml(reason)}</em></p>` : ""}
      <p>Future proposals will adjust based on this.</p>
      <p style="color:#888;font-size:0.85em">Proposal: ${escapeHtml(proposalText.slice(0, 200))}</p>
    </body>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

function rejectForm(proposalId: string): Response {
  return new Response(
    `<!doctype html><body style="font-family:system-ui;padding:2rem;max-width:32rem;line-height:1.5">
      <h2>❌ Why are you rejecting this?</h2>
      <p>One sentence is plenty. Future proposals will avoid this pattern.</p>
      <form method="get" action="/reject/${proposalId}">
        <textarea name="reason" rows="3" style="width:100%;font:inherit;padding:0.5rem"
          placeholder="too long / wrong topic / already knew / not actionable..."></textarea>
        <br><br>
        <button type="submit" style="font:inherit;padding:0.5rem 1rem">Save</button>
      </form>
    </body>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

async function opsPage(env: Env): Promise<Response> {
  const runs = await env.DB.prepare(
    `SELECT ts, status, duration_ms, input_count, output_count, claude_tokens, error FROM runs ORDER BY ts DESC LIMIT 14`
  ).all<{ ts: string; status: string; duration_ms: number; input_count: number; output_count: number; claude_tokens: number; error: string | null }>();

  const decisionStats = await env.DB.prepare(
    `SELECT action, COUNT(*) as n FROM decisions WHERE ts > datetime('now', '-30 days') GROUP BY action`
  ).all<{ action: string; n: number }>();

  const heartbeat = await env.PIPELINE_STATE.get("heartbeat:main");
  const heartbeatAgeH = heartbeat
    ? ((Date.now() - new Date(heartbeat).getTime()) / 3_600_000).toFixed(1)
    : "never";

  const html = `<!doctype html><body style="font-family:system-ui;padding:2rem;max-width:48rem;line-height:1.5">
    <h1>Pipeline ops</h1>
    <p>Heartbeat: <strong>${heartbeat ?? "(none)"}</strong> — ${heartbeatAgeH}h ago</p>

    <h2>Last 14 runs</h2>
    <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%">
      <tr><th>When</th><th>Status</th><th>ms</th><th>In</th><th>Out</th><th>Tokens</th><th>Error</th></tr>
      ${runs.results.map(r =>
        `<tr>
          <td>${r.ts.slice(0, 16)}</td>
          <td>${r.status}</td>
          <td>${r.duration_ms ?? "-"}</td>
          <td>${r.input_count ?? "-"}</td>
          <td>${r.output_count ?? "-"}</td>
          <td>${r.claude_tokens ?? "-"}</td>
          <td>${escapeHtml(r.error ?? "")}</td>
        </tr>`
      ).join("")}
    </table>

    <h2>Last 30 days — decisions</h2>
    <ul>
      ${decisionStats.results.map(d => `<li>${d.action}: ${d.n}</li>`).join("")}
    </ul>
  </body>`;

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

async function markSuccess(env: Env, runId: string, startTs: number, inputCount: number, outputCount: number, tokens: number): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO runs (id, ts, cron, status, duration_ms, input_count, output_count, claude_tokens) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(runId, new Date().toISOString(), "main", "success", Date.now() - startTs, inputCount, outputCount, tokens).run();

  await env.PIPELINE_STATE.put("heartbeat:main", new Date().toISOString());
}

async function markFailure(env: Env, runId: string, startTs: number, error: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO runs (id, ts, cron, status, duration_ms, error) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(runId, new Date().toISOString(), "main", "failure", Date.now() - startTs, error).run();
}

async function markPartial(env: Env, runId: string, startTs: number, note: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO runs (id, ts, cron, status, duration_ms, error) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(runId, new Date().toISOString(), "main", "partial", Date.now() - startTs, note).run();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
