# Lesson 01 — What is an "agent"?

> Use when the student asks any version of "wait, what is Claude actually doing here?" Use the analogies; don't paste this verbatim.

---

## The 30-second answer

An **agent** is an AI model given a job, the tools to do it, and the freedom to take several steps on its own to get it done.

That's it. The word is loaded with hype, but the concept is small: instead of asking Claude one question and getting one answer, an agent gets a job and a set of tools — "read this file," "call this API," "send this email" — and Claude decides what tools to call, in what order, until the job is done.

## The two-part picture

```
Without an agent:
  You: "Summarize this article."
  Claude: "Here's the summary."
  Done. One question, one answer.

With an agent:
  You give Claude a job and tools:
    Job: "Every morning, find the 3 most important things for me and email them."
    Tools: read_vault_notes, call_rss_feed, call_claude, send_email

  Each morning, the agent:
    1. Reads recent vault notes for context
    2. Reads RSS feeds for new content
    3. Asks Claude which 3 items matter most
    4. Sends the email with keep/reject buttons
    5. Logs the run
    6. Done. No human in the loop.
```

## Where Claude Code fits in

Claude Code is an agent. It runs on your laptop. The job is "help me build a pipeline." Its tools include "read this file," "run this shell command," "edit this code," "ask the user a question." Each turn it picks tools and uses them to make progress.

The Pipeline Tutor — the CLAUDE.md file in this folder — is an agent built on top of Claude Code. Same machinery, more focused job description.

## Where your pipeline fits in

The thing you're building — a Cloudflare Worker that wakes up on a cron, reads inputs, asks Claude to synthesize them, sends the result — is also an agent. It runs in the cloud instead of on a laptop. It runs on a schedule instead of in response to a chat message. But the architecture is the same:

1. **Job**: defined in a system prompt
2. **Tools**: HTTP fetch, KV read/write, send email/Telegram
3. **Loop**: cron fires → Worker runs → Claude processes → output goes out → decisions logged → repeat

## Why this framing matters

When you understand "agent = job + tools + a small loop," everything else snaps into place:

- The system prompt is the job description
- The Worker code is the tools wrapper
- The cron is the trigger that starts the loop
- The decision log is how the agent learns what you actually wanted

If "agent" sounds like Skynet, you'll be intimidated. If it sounds like "a kitchen timer that calls a smart assistant and writes the result on a notepad," you're calibrated correctly.

## The analogy to keep in your head

> Imagine a desk with a kitchen timer, a phone, a notepad, and a label printer.
>
> Every morning at 7am the timer goes off. A small robot at the desk:
> - Checks your vault notes on GitHub for what you're focused on this week
> - Picks up the phone, calls an RSS service, takes notes
> - Calls Claude on a different line, reads the notes out, asks "which 3 items matter for this person today?"
> - Writes the answer on the label printer, sticks the label on an envelope, mails it to you
>
> That's the pipeline. The timer is the cron. The robot is the Worker. The phone is HTTP fetch. The notepad is KV. Claude is Claude. The envelope is your email.

Nothing about it is mysterious. Each piece is small. The value comes from them being stitched together — and from running reliably, every day, without you having to think about it.
