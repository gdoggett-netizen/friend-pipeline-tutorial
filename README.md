# Your Personal AI Pipeline — Complete Reference Guide

> This document is both the orientation and the long-term reference. Read it before your first session. Come back to it when something breaks, when you want to add a feature, or when you're explaining the system to someone else.

---

## What you're building and why

You've already built your second brain — an Obsidian vault connected to GitHub. That was the foundation. This is the next layer: a **pipeline** that reads from the world, thinks with Claude, writes to you on a schedule, and gets smarter each time you engage with its output.

Greg's system — which this tutorial is based on — has been running in production for ~5 weeks. Everything in here has been earned, not guessed. The mistakes are already baked into the canon; you don't have to repeat them.

At the end of this tutorial you will have:

1. **A Cloudflare Worker** — a small program running 24/7 in the cloud (free tier) that wakes up on a schedule you choose
2. **An Obsidian vault** connected to **GitHub as the source of truth** — your notes, your pipeline output, your decision history all living in one place
3. **A decision loop** — the mechanism that makes this a pipeline and not just a fancy newsletter
4. **A heartbeat watcher** — so you know within 26 hours if anything breaks silently
5. **A clear path forward** — placeholders for the Mac Mini agent and Agent Swarm that you'll add when you're ready

---

## Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│  YOUR SYSTEM (current build)                                 │
│                                                              │
│  ┌──────────────┐    ┌─────────────────┐                    │
│  │   Obsidian   │◄──►│  GitHub Repo    │  ← source of truth │
│  │    Vault     │    │  (vault-sync.sh)│                    │
│  └──────────────┘    └────────┬────────┘                    │
│                               │ pipeline reads from here    │
│  ┌──────────────────────────────▼──────────────────────┐    │
│  │  Cloudflare Worker (Cron: daily at your time)       │    │
│  │                                                      │    │
│  │  1. Fetch inputs (RSS / Readwise / Notion / etc.)   │    │
│  │  2. Read last 50 decisions from D1                  │    │
│  │  3. Call Claude (Sonnet, cached)                    │    │
│  │  4. Send output (email / Telegram / Slack)          │    │
│  │  5. Write heartbeat + run log                       │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  Watcher cron (every 4h): checks heartbeat, alerts if stale │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  PLACEHOLDERS (for when you're ready)                        │
│                                                              │
│  [ Mac Mini Agent ] ← runs local tasks, accesses vault      │
│  [ Agent Swarm   ] ← multiple specialized agents, fan-out   │
└─────────────────────────────────────────────────────────────┘
```

---

## The four phases

### Phase 1 — Interview (1–2 hours)
Before writing a line of code, the tutor will ask you questions. What do you want the pipeline to do? Where does the data come from? Where do you want to see the output? By the end, you'll have a `pipeline-spec.md` in your own words that becomes the contract for everything that follows.

### Phase 2 — Build v1 (1–3 sessions)
The smallest possible thing that runs end-to-end: one cron, one input, one Claude call, one email. No decision loop yet. No monitoring. No optimization. Just proof it works. This is the most important milestone — seeing your first scheduled email arrive from something you built.

### Phase 3 — The decision loop (1–2 sessions)
Add keep/reject buttons to the output. Every time you click one, the reason gets logged. The next run reads those logs and adjusts what it proposes. This is the line between "a script on a timer" and "a pipeline that learns." Don't skip this.

### Phase 4 — Polish (ongoing)
Prompt caching (drops Claude cost ~90%). Self-healing heartbeat watcher. HTML output for richer daily briefs. Extended decision loop. You don't have to do all of these — stop when it's boring-reliable and useful.

---

## The Obsidian + GitHub setup (your source of truth)

This is the most important piece of infrastructure to get right before anything else.

### Why GitHub is the source of truth (not Obsidian, not iCloud)
- Your pipeline runs in the cloud (Cloudflare). It can read from GitHub via API. It cannot read from your Mac, from iCloud, or from Obsidian's sync service.
- If your vault lives only in Obsidian Sync, your pipeline is flying blind.
- **Rule:** every note that should be readable by the pipeline must be committed to GitHub.

### The sync architecture
```
Your Mac
  Obsidian writes → vault-sync.sh runs every 15 min → git commit + push → GitHub

Your Phone / iPad
  Obsidian Sync → reads/writes to your vault directly (separate from GitHub)
  NOTE: Mobile edits only reach GitHub when your Mac runs vault-sync.sh next.
        For pipeline-critical notes, edit on Mac.

Cloudflare Worker
  reads vault via GitHub API → always sees the last pushed version
```

### Setting up vault-sync.sh
The `templates/vault-sync.sh` in this folder is the exact script Greg uses. Steps:

1. Copy it to `~/bin/vault-sync.sh`
2. Make it executable: `chmod +x ~/bin/vault-sync.sh`
3. Edit the `VAULT_PATH` and `GITHUB_REPO` variables at the top
4. Run it once manually to test: `~/bin/vault-sync.sh`
5. Wire it to a LaunchAgent (the tutor will walk you through this) to run every 15 minutes automatically

### Your vault folder structure (recommended)
```
Your Vault/
├── Inbox/                ← drop zone for new captures (Siri, mobile, quick notes)
├── Pipeline/
│   ├── Output/           ← pipeline writes daily brief notes here
│   └── Decisions/        ← keep/reject logs (optional — D1 is the real log)
├── Projects/             ← long-lived work
├── Resources/            ← reference material (manuals, PDFs processed by Codex)
├── Journal/              ← daily notes
└── Archive/              ← anything you're done with but want to keep
```

---

## Cost guide (budget canon)

**Target: $0/month until the pipeline is earning you something.**

| Service | Free tier | What you'll use | Cost |
|---|---|---|---|
| Cloudflare Workers | 100K req/day | ~30/month for a daily cron | Free |
| Cloudflare KV | 100K reads/day, 1K writes/day | ~60/month | Free |
| Cloudflare D1 | 5M rows, 5GB | decision log, run log | Free |
| Claude (Pro/Max plan) | Included usage | daily pipeline with caching | ~$0–$0.50/mo after free quota |
| GitHub | Unlimited private repos | vault + pipeline repos | Free |

**If your monthly Claude bill exceeds $5 before you're using the output daily, something is wrong.** The two most common causes: prompt caching isn't hitting (see CANON § 3.2), or a retry loop is calling the API more than intended.

The tutor will warn you at every step that could push you out of free tier.

---

## Files in this folder

```
friend-pipeline-tutorial/
├── README.md                          ← you are here (the master reference)
├── CLAUDE.md                          ← the tutor's brain (read automatically by Claude Code)
├── CANON.md                           ← every hard-won lesson, organized by when it'll bite you
├── INTERVIEW.md                       ← the questions the tutor asks in session 1
├── FOR-YOUR-FRIEND.md                 ← Greg's intro letter
├── pipeline-spec.md                   ← filled in during the interview; the contract
│
├── lessons/
│   ├── 00-second-brain-to-pipeline.md ← bridge: what you already have + what's next
│   ├── 01-what-is-an-agent.md
│   ├── 02-what-is-cloudflare-workers.md
│   ├── 03-what-is-cron.md
│   ├── 04-what-is-kv.md
│   ├── 05-claude-api-basics.md
│   ├── 06-prompt-caching.md
│   ├── 07-the-decision-loop.md
│   ├── 08-self-healing.md
│   ├── 09-shipping-and-watching.md
│   ├── 10-obsidian-github-vault.md    ← vault sync, GitHub as source of truth
│   ├── 11-mac-mini-agent.md           ← PLACEHOLDER: when you add the Mac Mini
│   └── 12-agent-swarm.md              ← PLACEHOLDER: when you build the swarm
│
└── templates/
    ├── worker.ts                      ← the deployable Worker scaffold
    ├── wrangler.toml                  ← Cloudflare config
    ├── decision-log-schema.sql        ← D1 tables for decisions + run log
    ├── vault-sync.sh                  ← Greg's vault-to-GitHub sync script
    ├── package.json
    └── tsconfig.json
```

---

## How to start

### Prerequisites (check these off before opening the tutor)
- [ ] Claude Code installed: `brew install --cask claude-code` (or claude.ai/code)
- [ ] Signed in to Claude Code with your claude.ai account (Pro or Max plan recommended)
- [ ] Node.js installed: `node --version` should return 18+ 
- [ ] Git installed: `git --version` should return anything
- [ ] A GitHub account (free) with a repo ready for your vault
- [ ] A Cloudflare account (free — no credit card required for Workers free tier)
- [ ] Your Obsidian vault exists and you know where it lives on your Mac

### First session
```bash
cd /path/to/friend-pipeline-tutorial
claude
```

Then type: **"hey, I'm ready — what do I do first?"**

The tutor takes it from there.

---

## The decision loop — why it matters

Most people build a pipeline that produces output and call it done. That's a sophisticated timer. A pipeline that *learns* is different.

The loop:
```
Pipeline runs
  → produces proposals (summaries, alerts, insights, whatever you asked for)
  → you see them (email, Telegram, wherever)
  → you click "keep" or "reject" on each one
  → reason is logged (even one word: "too long", "perfect", "wrong topic")
  → next run reads last 50 decisions
  → Claude adjusts what it proposes based on your taste
  → repeat
```

After 2–3 weeks of decisions, the pipeline has a model of your taste. It stops proposing things you always reject. It leans into the patterns you keep. You don't configure this manually — it emerges from the data.

This is the whole point. Don't skip it.

---

## Mac Mini Agent — placeholder

When you add the Mac Mini as a dedicated agent computer, it becomes a local execution layer that the cloud pipeline cannot be. It can:

- Read files that aren't in GitHub (local documents, iCloud, Downloads)
- Run tools that require a Mac (AppleScript, Automator, local CLI tools)
- Process large files locally (PDFs, audio) before sending summaries to the cloud
- Run Claude Code sessions in the background on dedicated hardware

**See `lessons/11-mac-mini-agent.md` for the full setup guide.**

The Mac Mini does not change the cloud architecture — it adds a local node that syncs to the same GitHub source of truth.

---

## Agent Swarm — placeholder

The Agent Swarm is Greg's architecture for running multiple specialized agents that communicate through a shared inbox. At the right time, you'll add this on top of everything you've already built.

The pattern:
- Each agent has a role (Morning Brief, Sales Intelligence, Research, Capture)
- Agents communicate via `inbox/` files in a shared GitHub repo
- A primary agent (the "brain") coordinates the others
- Fan-out: broadcast messages go to all agents; point-to-point go to one

**See `lessons/12-agent-swarm.md` for the full architecture.**

Do not rush to this. Get the single pipeline boring-reliable first. The swarm amplifies what works — it also amplifies what's broken.

---

## When you get stuck

1. Type the problem to the tutor. It has the full CANON in its head and recognizes most issues by symptom.
2. Paste the exact error message — not a description of it. Exact.
3. Run `npx wrangler tail` and paste the live log output. Most bugs show clearly there.
4. If the tutor seems lost: `Ctrl+C`, then `claude` again. It re-reads CLAUDE.md and resets.
5. Text Greg. Always.

---

## Realistic timeline

| Milestone | Time |
|---|---|
| Session 1: Interview + spec locked | 1–2 hours |
| Session 2–3: v1 deployed, first email received | 2–4 hours total |
| Week 2: Decision loop wired up | +1–2 sessions |
| Week 3–4: Prompt caching, monitoring | +1 session |
| Month 2: Stable, boring, useful | Maintenance only |
| When ready: Mac Mini agent | Separate setup guide |
| When ready: Agent Swarm | Separate setup guide |

---

## The one rule

**GitHub is the source of truth.**

Your vault is in GitHub. Your pipeline code is in GitHub. Your decision log is in Cloudflare D1, but exports to GitHub on a schedule. If it's not in GitHub, it doesn't exist for the rest of the system.

Every time you make a meaningful change — to your vault, to your Worker code, to your prompts — commit it. The pipeline reads what's committed. You debug what's committed. When something breaks six weeks from now, you'll find the answer in the git log.

Welcome. Let's build.
