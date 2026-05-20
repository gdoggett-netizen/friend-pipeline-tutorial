# Lesson 03 — What is cron?

> Use when introducing the schedule. The student needs to understand what the cron expression means before they configure one.

---

## The plain-English version

**Cron** is a way to say "run this code at this time, repeatedly." The name comes from an old Unix tool. The pattern is a string of five numbers that encodes when to run.

Cloudflare Workers support cron triggers natively — you define the pattern in `wrangler.toml`, and Cloudflare calls your `scheduled` handler at that time.

## Reading a cron expression

```
┌────────── minute (0-59)
│  ┌─────── hour (0-23)
│  │  ┌──── day of month (1-31)
│  │  │  ┌─ month (1-12)
│  │  │  │  ┌ day of week (0-6, Sunday=0)
│  │  │  │  │
*  *  *  *  *
```

Common patterns:

| Pattern | Meaning |
|---|---|
| `0 12 * * *` | Every day at 12:00 UTC |
| `0 12 * * 1-5` | Weekdays at 12:00 UTC |
| `0 */4 * * *` | Every 4 hours |
| `30 10 * * *` | Every day at 10:30 UTC |

`*` means "every" for that position. `1-5` means Monday through Friday. `*/4` means "every 4th."

## CRITICAL: Cloudflare crons run on UTC

Always. UTC does not observe daylight saving. Your "7am" changes depending on your timezone and the time of year.

| Target time | US Eastern Standard (Nov–Mar) | US Eastern Daylight (Mar–Nov) |
|---|---|---|
| 6:00 AM | `0 11 * * *` | `0 10 * * *` |
| 7:00 AM | `0 12 * * *` | `0 11 * * *` |
| 8:00 AM | `0 13 * * *` | `0 12 * * *` |

**Greg's pipeline runs at `0 10 * * *` (6am ET in summer, 5am ET in winter).** He accepted the 1-hour seasonal drift rather than add logic to handle it. That's the simpler choice for a personal pipeline.

The tutor will always translate the UTC cron to your local time before you confirm it. If the translation is wrong, say so.

## Where cron is defined

In `wrangler.toml`:

```toml
[triggers]
crons = [
  "0 12 * * *",   # main pipeline — daily at 12:00 UTC
  "0 */4 * * *",  # watcher — checks heartbeat every 4 hours
]
```

In your Worker code, the `event.cron` field tells you which cron fired:

```ts
async scheduled(event, env) {
  if (event.cron === "0 */4 * * *") {
    return runWatcher(env);
  }
  return runMainPipeline(env);
}
```

## Testing the cron locally

With `npx wrangler dev` running, you can trigger the scheduled handler manually without waiting for the real time:

```bash
curl "http://localhost:8787/__scheduled?cron=0+12+*+*+*"
```

Note: spaces in the cron expression become `+` in the URL. This fires your scheduled handler immediately, regardless of the actual time. Use this to test before deploying.

## The watcher cron

Your pipeline has two crons:
1. The **main pipeline cron** — does the real work (daily or whatever you set)
2. The **watcher cron** — checks every 4 hours whether the main pipeline ran recently

The watcher cron fires `0 */4 * * *` — every 4 hours. It reads a heartbeat timestamp from KV (written by the main pipeline after each successful run) and alerts you if the heartbeat is stale.

This is the self-healing pattern from `lessons/08-self-healing.md`. It's not optional — silent failure is the real failure mode for pipelines.
