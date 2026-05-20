# Hey — welcome to level two

You finished the second brain. Now we wire it up.

This tutorial is built on ~5 weeks of me running my own pipeline system in production — what I learned, what broke, what I'd do differently. The AI tutor in your terminal has that experience baked in, along with the original lessons from JT (who pioneered this stuff before either of us). You're getting the compounded version.

## What this is

You'll build a Cloudflare Worker — a small program that lives on Cloudflare's free servers, wakes up on a schedule you pick, reads from sources you care about, asks Claude to think about them, and sends you the result. The whole thing runs in free tiers until you're actually using it every day.

The part that makes it more than a fancy newsletter: a **decision loop**. Every output has "keep" and "reject" buttons. Every click gets logged. After a few weeks, the pipeline has a model of your taste. It stops proposing things you always ignore and leans into what you actually use. That's the part most people skip. We're not skipping it.

## What you already have going for you

You have an Obsidian vault. That's not just a collection of notes — it's potential pipeline input. The system we'll build can read from your vault (to know what you're thinking about), write to it (to drop a daily brief in there), or both. We'll figure out what fits your workflow in the interview.

The one thing we need to set up before anything else: get your vault connected to GitHub so the pipeline can read it from the cloud. The tutor will walk you through that first.

## The 3-step start

1. **Install Claude Code** — `brew install --cask claude-code` on Mac, or grab it at claude.ai/code. Sign in with the Claude account you already use.
2. **Open the tutor** — `cd` to this folder, then run `claude`. The `CLAUDE.md` file turns Claude Code into the tutor automatically.
3. **Say "hey, ready to start"** — the tutor will take it from there. It'll check your vault situation first, then ask you what you want the pipeline to do. Be honest. "I never actually look at my highlights" is useful. "I want something impressive" isn't.

## What the tutor will build with you

1. Your Obsidian vault properly connected to GitHub as the source of truth
2. A Cloudflare Worker that runs on a schedule you pick
3. One input source (your choice — we'll narrow it down in the interview)
4. Output to email or Telegram or wherever you'll actually see it
5. A decision loop that makes it smarter over time
6. A watcher that tells you within 26 hours if something breaks silently

Plus two placeholders for when you're ready:
- **Mac Mini agent**: when you add it, it becomes the local execution layer — can do things the cloud can't (read local files, run Mac-specific tools, process large files before sending summaries up)
- **Agent Swarm**: when you're ready, multiple specialized agents that communicate through a shared inbox. Don't rush to this — get one pipeline boring-reliable first.

## Cost

Everything in v1 is free. Cloudflare's free tier covers a daily-cron pipeline many times over. Claude's Pro or Max plan includes enough usage to run the pipeline without paying per token. If after a couple of months your monthly Claude bill is more than $5, something is broken (the tutor will tell you what before you find out from a bill).

## When you're stuck

Talk to the tutor. It has a full canon of known failure modes in its head and will recognize most problems by symptom. Paste the exact error message — descriptions are harder to diagnose than the real thing.

Or text me. Always.

## One more thing

The biggest mistake I made early on: building a pipeline I thought I *should* want instead of one I'd actually use. The tutor's first job is the interview — it's specifically designed to stop you from doing that. Small and useful beats impressive and ignored every time. Pick the thing you most wish happened automatically. The fancy stuff comes later.

Have fun. Welcome to the swarm.

— Greg
