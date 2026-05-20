# Lesson 02 — What is Cloudflare Workers?

> Use before the student touches wrangler for the first time. The goal is for them to understand what they're deploying to before they deploy anything.

---

## The plain-English version

A **Worker** is a small program that lives on Cloudflare's servers. You write the code, Cloudflare runs it. You don't manage a server, you don't pay for idle time, you don't SSH into anything. You just write the code and deploy it.

Two ways a Worker wakes up:
1. **HTTP request**: someone visits a URL → Worker runs → Worker responds
2. **Cron schedule**: the time matches → Worker runs → Worker does work, no response needed

Your pipeline uses both:
- The cron schedule wakes it up every day to do the main work
- HTTP routes let you visit `/keep/<id>` or `/reject/<id>` to log decisions

## Why Cloudflare instead of a Mac or a server?

You could run a cron script on your Mac. Greg does this for vault-sync.sh. But for a pipeline that:
- Needs to run while your Mac is closed or off
- Needs to be reachable at a URL (for keep/reject buttons)
- Shouldn't require you to manage a Linux server

...Cloudflare Workers is the right answer. Free tier is generous enough for a personal pipeline. No credit card required to start.

## The free tier (what you're actually working with)

| What | Free tier limit | What your pipeline uses |
|---|---|---|
| Worker requests | 100,000/day | ~2–5/day (cron + occasional keep/reject) |
| CPU time | 10ms/request (Workers Unbound: more) | Fine for most pipelines |
| KV reads | 100,000/day | ~5/day |
| KV writes | 1,000/day | ~3/day |
| D1 reads | 5M/day | Well within |

Translation: you won't come close to the free limits with a personal pipeline.

## What wrangler is

`wrangler` is the command-line tool that Cloudflare provides to manage Workers. You use it to:
- Deploy your Worker (`npx wrangler deploy`)
- See live logs from your Worker (`npx wrangler tail`)
- Set secrets (`npx wrangler secret put`)
- Create KV namespaces and D1 databases
- Roll back to a previous version (`npx wrangler rollback`)

You don't need to install it globally. `npx wrangler` downloads and runs it on demand.

## The deploy flow

```
Your code (worker.ts)
  → npx wrangler deploy → Cloudflare compiles it
  → Deploys to ~300 data centers worldwide simultaneously
  → Cron fires at scheduled time → Worker runs from the nearest data center
  → Logs available via npx wrangler tail
```

There is no "server" in this picture. The Worker is just code waiting to be invoked.

## How to log in

```bash
npx wrangler login
```

This opens a browser window to cloudflare.com. Log in with (or create) your free Cloudflare account. After that, wrangler stores a token locally and every subsequent command uses it.

**Before doing this:** the tutor will show you this command, confirm you're ready to create a Cloudflare account, and wait for explicit "go ahead." Never run this without understanding what it does.

## The dashboard

After your first deploy, you can see your Worker at:
`https://dash.cloudflare.com/?to=/:account/workers`

This page shows:
- Your Worker's name and status
- When it last ran
- Logs from recent runs
- A button to trigger it manually ("Test trigger")

The tutor will show you this URL after your first deploy. If you can see your Worker in the dashboard, the deploy worked.

## Rolling back

If you deploy something broken:
```bash
npx wrangler rollback --name your-worker-name
```

You're back to the previous version in seconds. Workers are stateless — there's no database to corrupt, no files to restore. A rollback is safe. Show yourself this command before you need it; knowing it exists makes you braver about experimenting.
