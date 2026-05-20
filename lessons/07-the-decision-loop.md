# Lesson 07 — The Decision Loop

> This is the most important lesson. Introduce it in Phase 3, after v1 is deployed and the student has seen their first scheduled output. The decision loop is what separates a pipeline from a fancy newsletter.

---

## The insight

Your pipeline produces output. You see it. You either use it or you don't. If nothing remembers your reaction, the next run proposes the same kinds of things. If you reject the same type of item 10 times in a row, the pipeline keeps proposing it anyway.

The decision loop changes this:

```
Pipeline runs → produces proposals
  → You see them in your email/Telegram
  → You click "keep" or "reject" on each one
  → Your reaction is logged with a reason
  → The next run reads your last 50 reactions
  → Claude adjusts what it proposes based on what worked
  → Repeat
```

After 2–3 weeks of consistent feedback, the pipeline has a working model of your taste. It stops proposing things you always reject. It leans into the patterns you keep approving. You don't program each rule explicitly — it emerges from the data.

This is the entire point. Don't skip it.

## What "without the loop" looks like

A pipeline that runs for 6 months without a decision loop:
- Proposes the same categories of things, in the same way, forever
- You start ignoring the output because it's not tailored to you
- You stop clicking keep/reject because nothing changes anyway
- The pipeline becomes ambient noise you've tuned out

A pipeline with a working decision loop:
- After week 1: starts adjusting based on early signals
- After month 1: feels like it knows you
- After month 3: you occasionally forget it's automated because the output is that well-matched to your preferences

## The implementation

### Step 1: the D1 decisions table

```sql
-- In migrations/001_init.sql
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  proposal_text TEXT NOT NULL,
  action TEXT NOT NULL,     -- "keep" or "reject"
  reason TEXT               -- one sentence, can be null
);

-- Run log (for Phase 4 monitoring)
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  cron TEXT,
  status TEXT NOT NULL,     -- "success", "failure", "partial"
  duration_ms INTEGER,
  input_count INTEGER,
  output_count INTEGER,
  claude_tokens INTEGER,
  error TEXT
);
```

Apply with:
```bash
npx wrangler d1 migrations apply pipeline-decisions --name your-worker-name
```

### Step 2: keep/reject URLs in every email

Every proposal you send should have two clickable URLs:

```
Here's today's top item:

"The weekly Stripe trends report is out — conversion rates up 4% in SaaS."
Why this matters: Relevant to your sales pipeline context.

✅ Keep:   https://your-worker.workers.dev/keep/abc123
❌ Reject: https://your-worker.workers.dev/reject/abc123
```

The `/reject/` endpoint shows a tiny form asking "why?" (one line textarea). Even one word ("too long", "already knew", "wrong topic") is enough signal.

### Step 3: the HTTP endpoints in your Worker

```ts
// In the fetch handler:
if (url.pathname.startsWith("/keep/")) {
  const id = url.pathname.slice("/keep/".length);
  const reason = url.searchParams.get("reason") ?? "";
  return logDecision(env, id, "keep", reason);
}
if (url.pathname.startsWith("/reject/")) {
  const id = url.pathname.slice("/reject/".length);
  const reason = url.searchParams.get("reason");
  if (reason === null) return rejectForm(id);  // show the form first
  return logDecision(env, id, "reject", reason);
}
```

When you log a decision, store the proposal text in the `decisions` table. You need the text — not just the ID — because the next run will include the text verbatim in the system context.

### Step 4: read decisions on every pipeline run

At the start of each run, before calling Claude, read the last 50 decisions:

```ts
const recentDecisions = await env.DB.prepare(
  `SELECT action, reason, proposal_text FROM decisions ORDER BY ts DESC LIMIT 50`
).all();

const decisionsContext = recentDecisions.results
  .map(d => `${d.action.toUpperCase()}: "${d.proposal_text.slice(0, 120)}…" — ${d.reason ?? "(no reason)"}`)
  .join("\n");
```

Pass this in the **user message** (not the system prompt — it varies per run and would break the prompt cache):

```ts
const userMessage = [
  `Today's date: ${today}`,
  "",
  "Today's inputs:",
  inputs.join("\n"),
  "",
  "Recent decisions (most recent first, last 50):",
  decisionsContext || "(none yet — first run)",
  "",
  "Now produce up to 3 proposals following your system prompt rules.",
].join("\n");
```

Claude reads the decisions context and adjusts. You don't have to configure anything manually — the signal is in the data.

## Why 50 decisions?

Enough signal to be meaningful, small enough that it doesn't dominate the context or push you past the cache boundary. If you have 200+ decisions, you could analyze patterns and write a compressed summary instead ("user consistently rejects items about X, consistently keeps items about Y") — but 50 raw decisions works fine for the first year.

## What good reasons look like

The reason field doesn't have to be formal. One or two words is enough:
- "too long" 
- "already knew"
- "perfect" 
- "wrong topic"
- "not actionable"
- "exactly what I want more of"

Each reason trains the pipeline. After 50 of these, you have enough signal that Claude can summarize the pattern in its context and adjust without you explicitly writing rules.

## The key principle

**Decisions are private to you.** The loop learns your taste, not an average across users. What you keep telling the pipeline to reject will stop appearing. What you consistently mark as "perfect" will appear more. The pipeline becomes a reflection of your actual preferences, not what you think you should prefer.
