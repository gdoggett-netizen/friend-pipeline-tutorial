# Lesson 09 — Shipping and Watching

> Use just before the first real deploy and after each subsequent deploy. The ritual of watching your Worker run matters for building confidence.

---

## The pre-deploy checklist

Before every deploy, verify:

- [ ] Tested locally: `npx wrangler dev` + `curl "http://localhost:8787/__scheduled?cron=0+12+*+*+*"` returned expected output
- [ ] Secrets are set: `npx wrangler secret list --name your-worker-name` shows all required keys
- [ ] wrangler.toml has the right KV and D1 IDs
- [ ] The cron expression is correct and you've confirmed the UTC-to-local-time translation
- [ ] You've read the scheduled handler and can describe in your own words what it does

If you can't check off all five, don't deploy yet.

## The deploy command

```bash
# Always explicit — never naked wrangler deploy (CANON § 1.1)
npx wrangler deploy --config wrangler.toml --name your-worker-name
```

Expected output:
```
✅ Uploaded your-worker-name (1.23 sec)
✅ Deployed your-worker-name triggers:
   Cron: 0 12 * * *
   Cron: 0 */4 * * *
Current Deployment ID: abc123...
```

If you see this: the deploy worked. Check the dashboard to confirm visually.

## After deploying: stay and watch

Open a live log stream:
```bash
npx wrangler tail --name your-worker-name
```

Keep this running until the next scheduled cron fires. Watch the logs. If the run completes with `heartbeat:main` written to KV and an email sent: success. Then walk away.

If it fails: you're already watching. Read the error in the logs. Don't debug blind — the log tells you almost everything.

## Triggering manually from the dashboard

You don't have to wait for the cron. In the Cloudflare dashboard:
1. Go to Workers → your worker → Triggers
2. Click "Test trigger" next to a cron
3. Watch `npx wrangler tail` for the output

Do this after the first deploy so you see a complete run before waiting overnight for the scheduled one.

## The ops page

Your Worker exposes a `/ops` endpoint (included in the template) that shows:
- Last heartbeat timestamp and age
- Last 14 runs with status, duration, output count
- Last 30 days of decisions: keep count vs. reject count

Visit: `https://your-worker.workers.dev/ops`

Bookmark this. It's your dashboard without needing to log into Cloudflare.

## Rolling back

If something is broken after a deploy:
```bash
npx wrangler rollback --name your-worker-name
```

You're back to the previous version in seconds. No data loss — KV and D1 are not affected by a Worker rollback. The state is preserved; only the code changes.

## The first successful run

When the first scheduled run completes and the output lands in your inbox (or Telegram, or wherever): stop. Don't immediately add features. Just sit with it for a moment.

A small program, living on Cloudflare's servers, woke up on its own schedule, read from a source on the internet, asked Claude to do something useful, and sent you the result. You built that. It'll run again tomorrow without you doing anything.

That's the baseline. Everything else — the decision loop, the caching, the monitoring — is built on top of this. Get this baseline stable and boring before adding anything.

## Deployment hygiene going forward

- **Use a `deploy` branch** for production code. Merge deliberately. Keep `main` for in-progress work.
- **Commit every meaningful change** — prompts, config, code. If it's not in git, it doesn't exist for debugging six weeks from now.
- **Test locally before every deploy.** `wrangler dev` + the manual cron trigger. One minute of local testing saves 10 minutes of remote debugging.
- **Watch the next run after every deploy.** Don't deploy and walk away.

## Common first-deploy failures

| Symptom | Likely cause |
|---|---|
| `curl` returns 404 with empty body | Deployed wrong wrangler.toml (CANON § 1.1) |
| Cron doesn't fire | wrangler.toml `[triggers]` section missing or malformed |
| `env.ANTHROPIC_API_KEY` is undefined | Secret not set via `wrangler secret put` |
| Claude returns empty string | Check system prompt for issues; add sanity check |
| KV read returns null | KV namespace ID in wrangler.toml is wrong |
| D1 query fails | Migrations not applied; check `wrangler d1 migrations apply` |
| Timeout after 60 seconds | Output too long; add streaming or reduce max_tokens |
