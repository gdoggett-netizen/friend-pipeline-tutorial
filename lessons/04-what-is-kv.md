# Lesson 04 — What is KV?

> Introduce KV only when the pipeline needs to remember something between runs. Don't introduce it earlier — it adds complexity before the student needs it.

---

## The plain-English version

**KV** stands for Key-Value. Think of it as a giant sticky note that your Worker can write on and read back later — even from a different run, hours or days later.

```
// Write a value
await env.PIPELINE_STATE.put("last-run-date", "2026-05-20");

// Read it back (even on a different run, days later)
const lastRun = await env.PIPELINE_STATE.get("last-run-date");
// → "2026-05-20"
```

That's most of what KV is. The key is the label. The value is what you stored. You can store any string (including JSON-serialized objects).

## Why your pipeline needs it

The main use case: **idempotency**. Your cron might fire twice on the same day if there's a retry. You don't want two emails. So:

```ts
const today = new Date().toISOString().slice(0, 10);  // "2026-05-20"
const lastRun = await env.PIPELINE_STATE.get("last-run-date");
if (lastRun === today) return;  // already ran today, skip

// do the work...

await env.PIPELINE_STATE.put("last-run-date", today);  // mark as done
```

Other things you'll store in KV:
- Heartbeat timestamps (for the watcher)
- Proposal text (so keep/reject endpoints can look up what was proposed)
- Config flags (things that change occasionally without a redeploy)

## How to create a KV namespace

```bash
npx wrangler kv namespace create PIPELINE_STATE --name your-worker-name
```

Wrangler prints something like:
```
✅ Created namespace with id "abc123..."
```

Copy that ID into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "PIPELINE_STATE"
id = "abc123..."
```

After deploying, `env.PIPELINE_STATE` in your code is the KV namespace.

## One important caveat: eventual consistency

KV is **eventually consistent** across Cloudflare's global network. If you write a value and immediately read it back from a different edge location, you might get the old value or null for a few seconds.

For your pipeline (which reads state on the next cron tick, hours later): this doesn't matter at all. For complex request/response flows: be aware.

## KV vs D1 — which to use?

| Use KV for | Use D1 for |
|---|---|
| Simple key/value state | Queryable data ("show me last 50 decisions") |
| Last-run timestamps | Structured history (decisions, run logs) |
| Heartbeat values | Anything you'd use SQL to query |
| Proposal text (short-lived) | Anything that needs relationships or sorting |

Start with KV. Add D1 when you need to ask questions of the data (which happens when you build the decision loop in Phase 3).
