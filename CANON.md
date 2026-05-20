# The Canon — Hard-Won Lessons from Real Production Pipelines

> Every item here came from a real failure. Greg's failures, or JT's before his. They are organized by the moment in your build where they'll bite you, not alphabetically — you'll meet them roughly in this order.
>
> Read it once now to get the shape. Come back when something breaks; find the symptom here.

---

## 1. Cloudflare deploy gotchas

### 1.1 Always pass `--config` and `--name` when deploying

If your repo has more than one `wrangler.toml` or any `wrangler.jsonc` in a parent directory, `npx wrangler deploy` will silently pick the wrong one. The deploy "succeeds" — but it deployed the wrong Worker. Your routes return 404 with no body and no error.

```bash
# CORRECT — explicit, every single time
npx wrangler deploy --config wrangler.toml --name your-worker-name

# WRONG — picks up whatever wrangler finds in any parent dir
npx wrangler deploy
```

**How you'll notice the bug:** deploy succeeds, `curl https://your-worker.workers.dev/api/anything` returns empty 404. Scheduled handler never fires. Worker logs show zero requests.

**Fix:** bake the flags into a `npm run deploy` script in `package.json`. You can't forget what's in the script.

### 1.2 Secrets are never committed — ever

```bash
# Set a secret (prompted for the value, or pipe it in)
echo "sk-ant-..." | npx wrangler secret put ANTHROPIC_API_KEY --name your-worker

# List what exists (values hidden — they're encrypted)
npx wrangler secret list --name your-worker

# Delete one
npx wrangler secret delete OLD_KEY --name your-worker
```

In Worker code, read with `env.ANTHROPIC_API_KEY`. Never `console.log` it. Never commit `.env`. If you accidentally print a secret to logs, rotate it at the provider immediately — assume it's leaked.

### 1.3 Cron expressions are UTC, always

Cloudflare runs crons on UTC. Your "7am" is different by timezone and shifts with daylight saving.

| Your timezone | "7am" as UTC cron |
|---|---|
| US Eastern (EST, winter) | `0 12 * * *` |
| US Eastern (EDT, summer) | `0 11 * * *` |
| US Pacific (PST, winter) | `0 15 * * *` |
| US Pacific (PDT, summer) | `0 14 * * *` |

**Fix:** pick a UTC time you can live with year-round and accept the 1h seasonal drift. Or have the Worker check wall-clock time and skip if it's not the right local hour. The first option is simpler.

### 1.4 A Worker cannot call itself via fetch

```js
// THIS DOES NOT WORK from inside a scheduled handler
const r = await fetch("https://your-worker.workers.dev/api/something");
// → returns 522 immediately, every time
```

Cloudflare blocks Workers from fetching their own routes. Shared logic between your schedule handler and your HTTP routes goes in **shared functions**, not in fetch calls.

### 1.5 No filesystem at runtime

A Worker has no `fs.readFile`. Runtime state goes in:

| Use case | Tool |
|---|---|
| "Did this run today?" / last-run timestamps / config flags | **KV** |
| Decision history, run logs, structured queryable data | **D1** (SQLite) |
| Generated HTML reports, PDFs, large blobs | **R2** (like S3) |

Files bundled at deploy time (`worker.ts`, static content) are read-only. If you need config that changes without redeploying, put it in KV.

### 1.6 Rolling back is fast and harmless

```bash
npx wrangler rollback --name your-worker
```

Workers are stateless and redeploy in seconds. There is nothing you can do that a rollback can't fix. Show this command early so the student trusts the safety net exists. Fear of "I'll break it forever" kills more pipelines than actual bugs.

---

## 2. Cron + idempotency

### 2.1 Every scheduled run must be idempotent

Cloudflare can fire your scheduled handler twice if the first run errors near completion. If running twice sends two emails, you'll get duplicates. Always:

1. Compute a key for "this run" — usually the date. `last-run-date = "2026-05-20"`
2. At the start of the handler, read from KV. If today already ran, return early.
3. Do the work.
4. Write the new key to KV.

```ts
async scheduled(event, env) {
  const today = new Date().toISOString().slice(0, 10);
  const last = await env.PIPELINE_STATE.get("last-run-date");
  if (last === today) return;  // already ran today

  await doTheWork(env);
  await env.PIPELINE_STATE.put("last-run-date", today);
}
```

### 2.2 Don't use sub-minute crons on free tier

Cloudflare's free plan has limits on scheduled runs. Hourly is safe. Sub-minute is both risky on free tier and expensive on paid. If you find yourself wanting `*/1 * * * *`, you probably need a push-triggered queue, not polling.

### 2.3 Pipelines fail silently — build the watcher first

This is the silent killer. Your cron stops firing, you don't notice for two weeks, and when you do, the fix is trivial. But you've lost two weeks of output and the trust that it'll keep running.

**The pattern (30 lines, saves weeks):**

```ts
// In your scheduled handler, on success:
await env.PIPELINE_STATE.put("heartbeat:main", new Date().toISOString());

// Separate handler, runs every 4 hours:
async function runWatcher(env) {
  const beat = await env.PIPELINE_STATE.get("heartbeat:main");
  if (!beat) return;  // hasn't run first time yet
  const ageHours = (Date.now() - new Date(beat).getTime()) / 3_600_000;
  if (ageHours > 26) {
    await sendAlert(env, `Pipeline hasn't run in ${ageHours.toFixed(1)}h`);
  }
}
```

26 hours for a daily pipeline (24h + 2h jitter). See `lessons/08-self-healing.md` for the full implementation.

---

## 3. Claude API

### 3.1 Default to Sonnet 4.6 for pipelines

`claude-sonnet-4-6` is right for 90% of pipeline tasks: fast, cheap, smart enough. Use Opus 4.7 only when:
- The task involves novel synthesis that Sonnet measurably fails at
- The output goes directly to a stakeholder without your review
- You've tested Sonnet on this exact task and its failure rate is too high

For extraction, summarization, classification, scoring, reformatting: Sonnet wins on cost-per-quality.

### 3.2 Always use prompt caching once your system prompt is stable

A scheduled pipeline runs the same system prompt over and over. Without caching, every run pays for those tokens. With caching, second run onward costs ~10% of the first.

```ts
const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 2048,
  cache_control: { type: "ephemeral" },  // cache the last cacheable block
  system: STABLE_SYSTEM_PROMPT,           // deterministic — this gets cached
  messages: [{ role: "user", content: TODAYS_VARYING_INPUT }],  // varies per run
});

// Verify it's working:
console.log(response.usage.cache_read_input_tokens);  // should be > 0 after first run
```

**The most common reason caching fails:** a varying value in the cached prefix. If your system prompt contains `Today is ${new Date()}` or any UUID or counter, the cache misses every run. Keep the system prompt byte-for-byte identical across runs. Push volatile content (today's date, today's inputs) into the user message.

### 3.3 Structured output: use `json_schema`, not prose instructions

When you need Claude to return JSON in a specific shape, don't write "respond in JSON with fields X, Y, Z." Use:

```ts
output_config: {
  format: {
    type: "json_schema",
    schema: {
      type: "object",
      properties: {
        proposals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              body: { type: "string" },
              why: { type: "string" },
            },
            required: ["body", "why"],
            additionalProperties: false,
          },
        },
      },
      required: ["proposals"],
      additionalProperties: false,
    },
  },
}
```

The output is guaranteed to parse. Saves an enormous class of bugs.

### 3.4 Streaming for long outputs, non-streaming for short

Non-streaming requests time out around 60 seconds. If your pipeline asks Claude to write more than ~1500 tokens, use streaming with `.finalMessage()`. For short outputs (top 3 highlights, a summary), non-streaming is fine and simpler.

### 3.5 Empty is better than wrong

Add to every pipeline system prompt:

> "If you cannot verify a claim from the provided sources, do not include it. It is always better to return fewer items, or to say 'nothing relevant today,' than to make up a fact, misattribute a quote, or invent a number."

Greg learned this watching JT's lesson play out in production: AI-generated outputs that *looked* right but contained hallucinated details destroy user trust permanently. One fabrication and every output becomes suspect. Apply this rule from day one.

### 3.6 Limit output cardinality

If your spec says "top 3," put "top 3 — never more, never fewer if there are 3 valid items, fewer if there aren't" in the system prompt. Otherwise Claude will give you 4 because the 4th was also good. The point of "top 3" is the discipline of choosing.

---

## 4. Cost control — non-negotiable

A pipeline that costs $50/month before it's earning you $50/month is a bad pipeline.

### 4.1 Use the cheapest model that works

Haiku 4.5 for classification and tagging. Sonnet 4.6 for everything else. Opus 4.7 for the rare 5% where quality difference is measurable and stakes are high enough to pay for it.

### 4.2 Cache, cache, cache

See § 3.2. Caching reduces the marginal cost of each run to nearly zero for the system-prompt portion. If your daily pipeline isn't cache-hitting after the first run, that's a bug.

### 4.3 Always set `max_tokens` explicitly

If you don't pass `max_tokens`, the model can run as long as it wants. A buggy system prompt that triggers a runaway response racks up cost. Set `max_tokens` to ~1.5× what you actually expect. For "top 3 highlights," that's maybe 1500 tokens — not 8000.

### 4.4 Monitor spend weekly for the first month

Anthropic's console shows daily spend. Check it. If daily spend goes up unexpectedly, something is hitting the API more than intended — usually a bad retry loop, a cache miss, or an unexpectedly-frequent cron. Catch it before the monthly bill.

**Free-tier target:** your pipeline should cost $0/month for the first 1–2 months using free tiers and the Pro/Max plan's included Claude usage.

---

## 5. State persistence — KV vs D1 vs R2

### 5.1 Use the simplest one that fits

| Need | Tool |
|---|---|
| Did this run today? / last-run timestamps / simple flags | KV |
| Show me all decisions from last 7 days / queryable history | D1 |
| Save this PDF / HTML report / audio file | R2 |

**Don't reach for D1 when KV will do.** D1 is more powerful but requires SQL and migrations. For 90% of pipeline state, KV is enough.

### 5.2 KV reads are eventually consistent

If you `put("foo", "bar")` and immediately `get("foo")`, you may get the old value or null. Replication takes seconds. For pipeline state where the next read happens an hour later (next cron), this is fine. Don't rely on KV freshness within a single Worker invocation.

### 5.3 D1 is real SQLite — write proper migrations

Don't evolve the schema by running DDL from inside a Worker. Write migration files (`migrations/001_init.sql`, `002_add_column.sql`) and apply with `npx wrangler d1 migrations apply`. Treat schema like code.

### 5.4 R2 for anything large or binary

Generated HTML reports, PDFs, audio transcripts. Keys work like filenames: `reports/2026-05-20-brief.html`. Public R2 buckets give you a URL the student can bookmark.

---

## 6. Obsidian + GitHub (source of truth canon)

### 6.1 GitHub is the source of truth — not Obsidian Sync, not iCloud, not local

The Cloudflare Worker runs in the cloud. It can reach GitHub via API. It cannot reach the student's Mac, iCloud Drive, or Obsidian's sync servers. If the vault isn't in GitHub, it doesn't exist for the pipeline.

**Rule:** any note you want the pipeline to read must be committed and pushed to GitHub.

### 6.2 vault-sync.sh is the bridge

Greg's sync script (`templates/vault-sync.sh`) runs every 15 minutes via a Mac LaunchAgent. It:
1. Commits any local Obsidian edits (`git add -A && git commit`)
2. Pulls with `--no-rebase -X ours` (local changes win conflicts)
3. Pushes to GitHub

Without this running: vault edits on Mac never reach the pipeline. Mobile edits via Obsidian Sync reach the Mac, but only reach GitHub after vault-sync.sh runs next.

### 6.3 Git is the canonical source for pipeline config

`wrangler.toml`, `worker.ts`, system prompts — all in git. KV and D1 hold runtime state (what happened). The runtime state is regenerable from inputs; the config is the value of your work. Don't put config in KV "for flexibility" — that's a way to lose it.

### 6.4 When you change a prompt, commit it

When you change the system prompt, you've created a new pipeline. Outputs before and after are not strictly comparable. Track prompt versions in git commits. If the decision loop matters to you, log the prompt version alongside each decision so you can answer "did keep rates change after I changed the prompt?"

### 6.5 Periodic state export to GitHub

KV and D1 are reliable but they're one provider. For a pipeline you depend on:
- A weekly cron that dumps D1 decisions as JSON to R2 (date-stamped key)
- Or a Worker route that returns all decisions as JSON, which you `curl` to a local file once a week

The config is in git. The decisions should be exportable. Don't let everything live only in Cloudflare.

---

## 7. The decision loop

### 7.1 Capture decisions with reasons, not just yes/no

"Keep" alone is half-data. "Keep — exactly what I wanted, actionable, short" tells the next run what to keep proposing. Always provide a reason field.

In the email/message output, include per-proposal URLs:
- `https://your-worker.workers.dev/keep/<id>?reason=` (with a textarea on the landing page)
- `https://your-worker.workers.dev/reject/<id>?reason=` (same, with "why?" prompt)

Even one-word reasons compound. After 50 decisions you have enough signal for the prompt to adapt.

### 7.2 Read recent decisions on every run

Include in the user message (not the system prompt — it varies per run):

```
Recent decisions:
- KEPT: "Top 3 themes from week's reading" (reason: "actionable, focused")
- REJECTED: "5-page synthesis of trends" (reason: "too long, didn't read it")
- REJECTED: "Daily quote of the day" (reason: "not what I want")
```

Limit to last ~50 decisions to keep the cache stable and within token budget. The model adjusts its proposals; you don't have to configure each rule manually.

### 7.3 Decisions are private to the user

Never aggregate decisions across users. Each person's decisions teach their pipeline only. This is correct ethically and produces better results — your taste isn't your friend's taste.

### 7.4 Without a decision loop, you've built an RSS reader

This is the line. A pipeline that produces output and never learns is a smart digest. A pipeline that captures decisions and adjusts is a system that compounds. Don't ship without it for v2 onwards.

---

## 8. Self-healing and monitoring

### 8.1 Build the watcher first

Pipelines fail silently. The failure mode is not "an error appears" — it's "the cron stops firing and no one knows." Day-one watcher pattern:

```ts
// On every successful scheduled run:
await env.PIPELINE_STATE.put("heartbeat:main", new Date().toISOString());

// Separate watcher, every 4h:
const beat = await env.PIPELINE_STATE.get("heartbeat:main");
const ageHours = (Date.now() - new Date(beat).getTime()) / 3_600_000;
if (ageHours > 26) await sendAlert(env, `Pipeline down ${ageHours.toFixed(1)}h`);
```

See `lessons/08-self-healing.md` for full implementation.

### 8.2 Log what you did, not what you intended

Every run should log: started at, finished at, inputs processed, tokens used, output destination. When something breaks two weeks later, those logs are how you reconstruct what happened. For Workers: `console.log` shows in `npx wrangler tail`. For persistent logs: a D1 `runs` table.

### 8.3 Never bypass safety to make the error go away

When a check fails — heartbeat stale, Claude response malformed, webhook signed wrong — the temptation is `try/catch` and continue. Don't. Investigate first. "I added more try/catch and it's working now" is the first stage of a system you no longer understand.

Standing rule: never use `--no-verify`, silent `try/catch`, or `if (false)` to make an alarm go quiet. Find the root cause. Fix that.

---

## 9. Deployment hygiene

### 9.1 Test locally with `wrangler dev` before deploying

```bash
# Terminal 1
npx wrangler dev

# Terminal 2 — trigger the scheduled handler manually
curl "http://localhost:8787/__scheduled?cron=0+12+*+*+*"
```

See logs immediately. If it fails locally, you haven't wasted a deploy slot.

### 9.2 Don't deploy and walk away — watch the next run

After deploying, stay attached to `npx wrangler tail` until the next scheduled run fires. Watch it succeed. Then walk away. "The deploy was fine, I just didn't realize the cron didn't fire" has bitten many pipelines.

### 9.3 Use a deploy branch

Set up a `deploy` or `production` branch. Merge to it intentionally. Main is for in-progress work. This prevents deploying half-finished changes by accident.

---

## 10. Beginner guardrails

### 10.1 Never run a destructive command without confirmation

`npx wrangler delete`, `wrangler d1 execute "DROP TABLE..."`, `git push --force` — always show the command, explain what it does, wait for explicit "yes."

### 10.2 Show the dashboard after every first touch

First deploy → show `https://dash.cloudflare.com/?to=/:account/workers`. Visual confirmation that the thing exists matters for confidence. Do the same for KV ("here's your namespace in the UI") and D1.

### 10.3 Read the code together before deploying

If the student says "looks good, ship it" without reading: ask them to summarize the scheduled handler in their own words. If they can, deploy. If they can't, read it together, line by line.

### 10.4 Encourage deliberate breakage

Workers are reversible. Have them deploy something slightly wrong on purpose, watch it fail in `wrangler tail`, then fix it. Muscle memory for the failure path is more valuable than getting it right the first time.

---

## 11. Architecture options — cloud vs. local vs. Routines

- **Cloudflare Workers + cron**: right for most personal pipelines. Serverless, no machine to manage, generous free tier, can call any HTTP API.
- **Claude Routines (claude.ai/code/scheduled)**: if your pipeline is "wake up, call Claude, write result somewhere" with no local files needed, Routines are simpler — no infrastructure to manage. Included in Max plan up to a daily cap.
- **Local cron / launchd + Claude Code**: if your pipeline needs local files (an Obsidian vault, a Downloads folder), it has to run on a machine that has them. `vault-sync.sh` is the bridge that makes local content available to cloud pipelines.

For most personal pipelines: Cloudflare Workers. Don't over-engineer.

---

## 12. HTML output — when and how

When pipeline output is rich enough that plain-text email doesn't carry it well:

1. Worker generates an HTML file (full page, styled)
2. Uploads to R2 with a date-stamped key
3. Emails a link to the R2 file (the file is the output, not the email body)

**Hard rules (every one learned from a real failure):**

- **No JavaScript.** iPhone Files app and most email clients won't run it.
- **No `display:none` or click-to-expand.** Every section visible on first paint.
- **No abbreviation.** If the pipeline generates "5 themes," show all 5. "Click to see more" defeats the purpose.
- Self-contained CSS in a `<style>` block. No external fonts or images.

These rules look limiting but produce HTML that works everywhere: in email previews, on iPhones, archived as PDF, opened a year from now.

---

## 13. When you're stuck

1. **Don't guess.** Open `npx wrangler tail` and trigger the path. Watch the logs.
2. **Read the actual error.** Most failures have a clear cause in the log.
3. **Search this canon for the symptom.** "404 with empty body" → § 1.1. "Cache always misses" → § 3.2. "Scheduled handler not firing" → § 1.3 or § 2.3.
4. **If not in the canon, ask the tutor.** Paste the exact error message.
5. **If the tutor is lost:** restart Claude Code (`Ctrl+C`, then `claude`). It re-reads CLAUDE.md and resets.

---

## Vocabulary

| Word | Plain English |
|---|---|
| **Worker** | A small program that runs on Cloudflare's servers when triggered by a URL or a schedule. You write the code; Cloudflare runs it. No server to manage. |
| **Scheduled handler** | The function inside a Worker that runs on a cron schedule. |
| **Cron** | A pattern like `0 12 * * *` meaning "run this at 12:00 UTC every day." |
| **KV** | Key-value store. Like a sticky note database: `set('foo', 'bar')` and `get('foo')`. |
| **D1** | Cloudflare's SQLite database. You write SQL against it. |
| **R2** | Cloudflare's file storage — for blobs (PDFs, HTML reports, images). |
| **wrangler** | The command-line tool to deploy and manage Workers. |
| **Secret** | A sensitive value (API key, token) stored encrypted on Cloudflare. Set via `wrangler secret put`. Never committed to your repo. |
| **Prompt caching** | A Claude API feature that reuses the same system prompt cheaply across many calls. Second run onward costs ~10% of first. |
| **Idempotent** | Running the same operation twice has the same effect as running it once. |
| **Heartbeat** | A timestamp written by your pipeline saying "I'm alive." Checked by a watcher to detect silent failures. |
| **Decision loop** | Capturing how a user responds to pipeline output (keep/reject) and feeding that signal back into the next run to improve proposals. |
| **vault-sync.sh** | A shell script that commits and pushes your Obsidian vault to GitHub on a schedule. The bridge between local notes and the cloud pipeline. |
| **LaunchAgent** | A macOS background task that runs a script automatically (like a Mac-native cron). Used to run vault-sync.sh every 15 minutes. |
| **Source of truth** | The one place that holds the authoritative version of something. For this system: GitHub. |
