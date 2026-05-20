# Lesson 00 — From Second Brain to Pipeline

> This lesson is for the tutor. Use it when the student asks "wait, how does the pipeline connect to my vault?" or "what's different about this tutorial vs. the second-brain one?"

---

## What they already built

The second-brain tutorial gave the student:
- An **Obsidian vault** — a markdown note-taking system organized the way they think
- A habit of capturing and organizing information
- Some understanding of how notes link to each other

What the vault is NOT yet:
- Readable by anything outside their Mac (unless it's already on GitHub)
- Wired to any automated process
- A source of input for an AI pipeline

## The gap we're closing

```
Second brain tutorial:       Pipeline tutorial:
  Information → Notes          Information → Notes → Action
  Capture → Store              Capture → Store → Process → Output → Learn
```

The pipeline adds:
1. **Automated reading** — the pipeline can read vault content as input
2. **AI synthesis** — Claude processes what it reads and produces something useful
3. **Scheduled delivery** — output arrives on a timer, not when you remember to ask
4. **Decision feedback** — your responses train what comes next

## How the vault connects to the pipeline

The critical link: **GitHub**.

The Cloudflare Worker (the pipeline) runs in the cloud. It can make HTTP calls. It cannot read files on your Mac. But it CAN read from GitHub via the GitHub API.

So the chain is:
```
Your Mac (Obsidian edits)
  → vault-sync.sh (every 15 minutes)
  → GitHub repo
  → Cloudflare Worker reads via GitHub API
  → Claude processes
  → Output to you
```

Without vault-sync.sh running, the pipeline is reading stale vault content (whatever was last pushed manually). Set it up before the pipeline tries to read vault content.

## What the pipeline can do with the vault

**Read:**
- Recent journal entries → personalize the morning brief ("you mentioned wanting to focus on X this week")
- Project notes → stay aware of what you're working on
- An "intentions" or "focus" note you update regularly → shape what Claude proposes
- Specific reference notes → pass them as context to Claude for a specific question

**Write:**
- Daily brief notes → output lands in the vault, searchable and linkable
- Processed summaries of documents you dropped in an Inbox folder
- Decision logs → keep/reject history as vault notes (optional — D1 is the real log)

**Both (the full loop):**
- Pipeline reads vault → Claude synthesizes → writes output note back to vault
- Output note is now in the vault for you to work with, link, annotate
- vault-sync.sh picks it up and commits it → it's in GitHub
- Next run can read the previous output as context

## The practical setup (Phase 0)

Before the interview starts, confirm:

1. **Does the vault have a GitHub repo?** If not, create one (5 minutes):
   ```bash
   cd ~/path/to/your-vault
   git init
   git add -A
   git commit -m "initial vault commit"
   # Create a private repo on github.com, then:
   git remote add origin https://github.com/yourusername/your-vault.git
   git push -u origin main
   ```

2. **Is vault-sync.sh set up?** Copy from `templates/vault-sync.sh`, configure the vault path and GitHub repo, wire to a LaunchAgent. See `lessons/10-obsidian-github-vault.md` for the full walkthrough.

3. **Test the path:** make a small edit in Obsidian, let vault-sync.sh run (or trigger it manually), confirm the commit appears in the GitHub repo. If it does: the bridge is solid.

## What's the same as the second-brain tutorial

- The vault structure the student already has stays exactly as is
- Obsidian Sync (if they use it) keeps working unchanged
- No vault notes are moved or deleted
- The pipeline reads from GitHub, not from Obsidian — vault-sync.sh is the only new piece

## What's new

- vault-sync.sh: a shell script that keeps GitHub current
- A LaunchAgent that runs vault-sync.sh every 15 minutes automatically
- A Cloudflare Worker that reads from GitHub and produces output on a schedule
- A decision loop that makes the output improve over time

That's it. The vault is the foundation. The pipeline is the engine. GitHub is the bridge between them.
