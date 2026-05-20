# Lesson 12 — Agent Swarm

> ⚠️ PLACEHOLDER — This lesson is for when you're ready to scale beyond a single pipeline. Nothing here needs to be done now. Come back when your single pipeline is boring-reliable and you're ready to multiply.

---

## What the swarm is

The Agent Swarm is multiple specialized agents that communicate through a shared system. Instead of one pipeline that tries to do everything, you have several agents — each with a specific job — that can work independently and coordinate when needed.

Greg's system works this way. His setup (as of May 2026):
- **greg-pipeline**: morning brief — vault summary, personal life, learning, news
- **grassvalley-pipeline**: sales intelligence — deals, competitive intel, industry news, cross-pipeline insights
- **telegram-capture**: captures notes from Telegram to the vault
- **rss-flywheel**: monitors RSS feeds and surface top signal
- **nightly-synthesis** (planned): deeper cross-pipeline analysis

Each agent is specialized. They share a common source of truth (GitHub). They don't try to do each other's jobs.

## The fan-out protocol

Agents communicate through a shared `inbox/` directory in a GitHub repo. Two patterns:

**Point-to-point** (one agent to another):
```
inbox/agent-a-to-agent-b-2026-05-20T0800.md
```

**Broadcast** (one agent to all):
```
inbox/agent-a-to-ALL-2026-05-20T0800.md
```

A "drain" process (a scheduled Claude Code session or a cron script) reads the inbox, routes messages to the right agents, and cleans up processed messages.

This pattern means agents don't need to know about each other's internals. They just write to `inbox/` and read from `inbox/`. The drain handles routing.

## When a canon change happens

If you update a rule that all agents should follow (a new behavior standard, a new data format, a new API), you broadcast it:

1. Write `agent-a-to-ALL-[ts].md` with `type: canon` and the new rule
2. Drain commits the message to all machines
3. Each agent reads it on its next session start
4. Canon is now system-wide

Without this protocol: agents drift. Agent A learns a new rule; Agent B doesn't. Their outputs diverge. The swarm produces inconsistent results.

## The model hierarchy

When you run multiple AI models:
- **Claude Code** — primary authority. Makes final decisions. Reviews output from secondary models.
- **Claude API** — programmatic tasks, batch processing, automated runs
- **Other models** (Codex, Gemini, Grok, etc.) — always reviewed by Claude Code before their output goes into production

Don't let secondary models write directly to your vault or pipeline config without Claude Code review. This is not about distrust — it's about maintaining a consistent standard as the swarm grows.

## The Primary Agent designation

In a multi-machine swarm, one machine is designated the **Primary Agent**. This is not about hardware — it's about which agent has authority over canon and cross-agent decisions.

Greg's primary agent is whichever machine runs the main morning pipeline (currently his MacBook Air). If the primary machine changes, the README and agent roster update — the rules stay the same.

The primary agent:
- Holds canonical prompts and config
- Broadcasts canon changes to all other agents
- Reviews cross-agent decisions before they become actions

## The architecture with a full swarm

```
┌──────────────────────────────────────────────────────────┐
│  GITHUB (source of truth + inbox)                         │
│                                                           │
│  your-vault/               ← notes, pipeline output      │
│  your-pipeline/            ← Worker code, prompts        │
│  inbox/                    ← agent-to-agent messages     │
└──────────────────────────────────────────────────────────┘
         ↑ vault-sync.sh          ↑ workers write via API
         │
┌────────────────────┐    ┌────────────────────────────────┐
│  Mac / Mac Mini    │    │  Cloudflare Workers            │
│  (local agents)   │    │  (cloud agents)                │
│                    │    │                                │
│  vault-sync.sh     │    │  greg-pipeline (6am)          │
│  inbox drain       │    │  grassvalley-pipeline (6:45am) │
│  inbox processor   │    │  rss-flywheel                 │
│  claude-code sessions│  │  nightly-synthesis            │
└────────────────────┘    └────────────────────────────────┘
```

## When to build the swarm

Do NOT build the swarm until:
- At least one pipeline is running reliably for 2+ months
- The decision loop is generating consistent signal
- You have a specific second job that genuinely needs a separate agent (not just a separate cron)
- The primary pipeline is boring enough that you're bored maintaining it

The swarm amplifies what works. It also amplifies what's broken. Get one thing working well before multiplying it.

## The first step toward the swarm (when ready)

The smallest swarm is two pipelines with a shared inbox:
1. Your existing pipeline (call it `personal-pipeline`)
2. A new pipeline for a different domain (sales, research, whatever)
3. A shared GitHub repo with an `inbox/` directory
4. A rule: each pipeline reads `inbox/[pipeline-name]-*.md` on each run

That's it. No new infrastructure. No new tools. Just a convention for how agents leave messages for each other.

From there, add agents as you have specific jobs for them. Don't design the swarm — let it emerge from real needs.

---

*Return to this lesson when you're ready to scale. By then, your single pipeline will be the proven foundation the swarm is built on.*
