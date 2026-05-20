# Lesson 08 — Self-Healing and Monitoring

> Introduce in Phase 4. The heartbeat watcher is 30 lines of code that saves weeks of silent decay. Build it early.

---

## The real failure mode for pipelines

When your pipeline breaks, you will not get an error notification. You will not get a red alert. The failure mode is this: **the cron stops firing, and you notice two weeks later that you haven't gotten a morning email.**

At that point, you investigate, find a trivial fix (an expired API token, a config change, a rate limit), and fix it in 10 minutes. But you've lost 14 days of output. And more importantly, you've lost the trust that the pipeline is actually running.

The heartbeat watcher prevents this. It's 30 lines of code. Build it before you need it.

## The pattern

Every successful pipeline run writes a heartbeat:

```ts
// At the end of a successful run (after the email goes out):
await env.PIPELINE_STATE.put("heartbeat:main", new Date().toISOString());
```

A separate cron (every 4 hours) checks the heartbeat:

```ts
async function runWatcher(env: Env): Promise<void> {
  const beat = await env.PIPELINE_STATE.get("heartbeat:main");
  
  if (!beat) {
    // Pipeline hasn't run for the first time yet — not an alert condition
    console.log("No heartbeat yet. Pipeline hasn't run first time.");
    return;
  }
  
  const ageHours = (Date.now() - new Date(beat).getTime()) / 3_600_000;
  console.log(`Heartbeat age: ${ageHours.toFixed(1)}h`);
  
  // 26 hours for a daily pipeline: 24h expected + 2h jitter buffer
  if (ageHours > 26) {
    const message = `⚠️ Pipeline hasn't run in ${ageHours.toFixed(1)}h (last: ${beat})`;
    await sendAlert(env, message);
  }
}
```

In `wrangler.toml`:
```toml
[triggers]
crons = [
  "0 12 * * *",   # main pipeline
  "0 */4 * * *",  # watcher — fires every 4 hours
]
```

In the scheduled handler:
```ts
async scheduled(event, env) {
  if (event.cron === "0 */4 * * *") {
    return runWatcher(env);
  }
  return runMainPipeline(env);
}
```

## The alert

`sendAlert` should wake you up. Options in order of simplicity:

1. **Email** — same method you use to send the daily brief, but to yourself with subject "PIPELINE ALERT"
2. **Telegram** — if your pipeline outputs to Telegram already, use the same bot to send the alert
3. **iOS push via Pushover or Ntfy** — a free push notification service with a Worker-friendly API
4. **Slack DM** — if you live in Slack

Don't over-engineer the alert channel. Email works. The point is that *something* notices when *nothing* is happening.

## The run log (optional but recommended for Phase 4)

Every run should log what it did. A D1 `runs` table:

```ts
await env.DB.prepare(
  `INSERT INTO runs (id, ts, status, duration_ms, input_count, output_count, claude_tokens)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
).bind(
  runId,
  new Date().toISOString(),
  "success",
  Date.now() - startTs,
  inputs.length,
  proposals.length,
  response.usage.input_tokens + response.usage.output_tokens,
).run();
```

After a month, this table tells you:
- How long each run took (detecting slowdowns)
- How many inputs the pipeline processed (detecting source changes)
- Token usage trend (detecting cost creep)
- Failure rate (detecting flakiness)

See these logs at the `/ops` endpoint in your Worker — the template includes it.

## The principle: never bypass safety to silence an alarm

When the heartbeat check fires and you don't know why, the temptation is to add `try/catch` around the watcher and continue. Don't. Investigate first. Why was the heartbeat stale? What changed? "I silenced the alarm and it's quiet now" is the first stage of a system you no longer understand.

The rule: find the root cause. Fix that. The alarm is your friend — it's doing its job. Silencing it is just delaying the reckoning.
