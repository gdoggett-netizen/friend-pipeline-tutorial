# Lesson 11 — Mac Mini Agent

> ⚠️ PLACEHOLDER — This lesson is for when you add the Mac Mini to your setup. Nothing here needs to be done now. Come back to this when the hardware arrives and your cloud pipeline is boring-stable.

---

## What the Mac Mini changes

Your Cloudflare Worker runs in the cloud. It can make HTTP calls. It cannot:
- Read files that aren't in GitHub
- Run Mac-specific tools (AppleScript, Shortcuts, Automator)
- Process large local files (audio, video, large PDFs) before sending to Claude
- Run Claude Code sessions interactively in the background

A dedicated Mac Mini changes all of this. It becomes the **local execution layer** — the bridge between your local environment and the cloud pipeline.

## What the Mac Mini can do that the cloud can't

- **Read any local file** — Downloads, Desktop, iCloud, mail attachments, anything on disk
- **Run Claude Code sessions autonomously** — `claude -p "process the files in ~/Inbox and write summaries to ~/Gdog Brains/Resources"` as a cron job
- **Run heavy local processing** — transcribe audio files, OCR documents, extract text from PDFs before sending to Claude
- **Run AppleScript / Shortcuts** — interact with macOS apps (Reminders, Calendar, Messages, Contacts)
- **Stable compute** — unlike a laptop that sleeps, a Mac Mini is always on and always reachable

## The architecture with a Mac Mini

```
┌────────────────────────────────────────────────────────────┐
│  LOCAL LAYER (Mac Mini)                                     │
│                                                             │
│  LaunchAgent crons:                                         │
│    - vault-sync.sh (every 15 min) → GitHub                  │
│    - inbox-processor.sh (hourly)  → processes ~/Inbox files │
│    - claude-code sessions         → autonomous local tasks  │
│                                                             │
│  Mac Mini reads:                                            │
│    - Local files (Downloads, iCloud, mail)                  │
│    - Writes summaries → vault → GitHub                      │
└────────────────────────────────────────────────────────────┘
         │ vault-sync pushes processed content
         ▼
┌────────────────────────────────────────────────────────────┐
│  GITHUB (source of truth)                                   │
│  Cloud pipeline reads from here                             │
└────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────┐
│  CLOUD LAYER (Cloudflare Workers)                           │
│  Daily cron: reads vault from GitHub, calls Claude, sends  │
│  output to email/Telegram, logs decisions                   │
└────────────────────────────────────────────────────────────┘
```

The Mac Mini doesn't replace the cloud pipeline — it extends it with local capabilities. The GitHub repo remains the source of truth. Everything the Mac Mini produces gets committed to GitHub, where the cloud pipeline can read it.

## Setup checklist (when you're ready)

### 1. Basic Mac Mini setup
- [ ] macOS up to date
- [ ] SSH access enabled (System Preferences → General → Sharing → Remote Login)
- [ ] Homebrew installed
- [ ] Node.js 18+ installed
- [ ] Git configured with the same GitHub account

### 2. Install Claude Code
```bash
brew install --cask claude-code
```
Sign in with your claude.ai account. Test: `claude --version`

### 3. Clone your vault
```bash
git clone https://github.com/yourusername/your-vault.git ~/your-vault
```

### 4. Copy vault-sync.sh
```bash
cp ~/path/to/vault-sync.sh ~/bin/vault-sync.sh
chmod +x ~/bin/vault-sync.sh
```
Configure the vault path and GitHub repo. Set up the LaunchAgent (same as on your laptop).

### 5. Set up inbox processing (optional, Phase 2 of Mac Mini)
A LaunchAgent that periodically runs:
```bash
claude -p "Process any new files in ~/Inbox. For each file: summarize it in 3-5 bullets, save the summary to ~/your-vault/Resources/, move the original to ~/Inbox/Archive/. Done."
```

This is the document inbox pattern — you drop PDFs, audio transcripts, or any file into `~/Inbox`, and the Mac Mini processes them automatically.

### 6. Configure the Mac Mini as always-on
- System Preferences → Energy Saver → "Prevent Mac from sleeping automatically when display is off" — enable
- "Wake for network access" — enable
- Connect via ethernet if possible for reliability

## The model hierarchy on Mac Mini

If the Mac Mini runs multiple AI tools, keep this hierarchy:
- **Claude Code** (highest authority) — primary agent, makes decisions, reviews output from other tools
- **Claude API** (via scripts) — programmatic tasks, batch processing
- **Other models** (Codex, Gemini, etc.) — always reviewed by Claude Code before committing or deploying

Don't let output from secondary models go directly to production (vault, pipeline, GitHub) without Claude Code reviewing it. This prevents quality drift.

## When to add the Mac Mini

Do NOT add it until:
- Your cloud pipeline is running reliably for at least 4 weeks
- The decision loop is working
- You have a specific task the cloud pipeline can't do (local files, Mac-specific tools)

The Mac Mini adds capability but also adds maintenance — another machine to keep updated, another sync script to monitor, another failure point. Make sure the simple version is earning its keep before adding complexity.

## Communicating between Mac Mini and cloud

When the Mac Mini processes something and wants the cloud pipeline to know about it: **write to the vault and push to GitHub**. The cloud pipeline reads GitHub on the next run. That's the entire inter-system communication protocol. No webhooks, no queues, no APIs between them — just the shared GitHub repo.

If you eventually need the Mac Mini to trigger cloud pipeline runs immediately (not wait for the next cron): a GitHub Actions workflow can trigger a Cloudflare Worker via webhook when new content is pushed. That's a later refinement.

---

*Return to this lesson when the Mac Mini arrives. By then, your cloud pipeline will be the solid foundation this layer is built on.*
