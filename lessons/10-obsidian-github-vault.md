# Lesson 10 — Obsidian + GitHub: Your Vault as Source of Truth

> This is Phase 0 — it must be done before the interview and before any pipeline work. The pipeline reads from GitHub. If the vault isn't on GitHub, the pipeline is blind to it.

---

## Why this matters

Your Obsidian vault lives on your Mac. Your pipeline lives on Cloudflare's servers in the cloud. Those two things cannot talk to each other directly. The bridge is GitHub.

The chain:
```
Obsidian edits on your Mac
  → vault-sync.sh (every 15 minutes)
  → GitHub repo
  → Cloudflare Worker reads via GitHub API
```

Without this chain, the pipeline cannot see your vault. With it, anything you write in Obsidian is available to the pipeline within 15 minutes.

## Step 1: Create a GitHub repo for your vault

If you don't already have one:

```bash
# Navigate to your vault folder
cd ~/path/to/your-vault

# Initialize git if not already done
git init
git add -A
git commit -m "initial vault commit"
```

Then on github.com:
1. Click "+" → "New repository"
2. Name it (e.g., `my-vault` or `second-brain`)
3. Set it to **Private** — your vault is personal
4. **Do not** initialize with README (you already have content)
5. Click "Create repository"
6. Copy the remote URL (looks like `https://github.com/yourusername/my-vault.git`)

Back in your terminal:
```bash
git remote add origin https://github.com/yourusername/my-vault.git
git push -u origin main
```

Verify: go to github.com/yourusername/my-vault — you should see your vault files there.

## Step 2: Set up vault-sync.sh

Copy the script from `templates/vault-sync.sh` in this tutorial folder:

```bash
mkdir -p ~/bin
cp templates/vault-sync.sh ~/bin/vault-sync.sh
chmod +x ~/bin/vault-sync.sh
```

Edit it to set your vault path and repo:
```bash
nano ~/bin/vault-sync.sh
```

Change these two lines at the top:
```bash
VAULT_PATH="$HOME/path/to/your-vault"  # ← your actual vault path
GITHUB_REPO="git@github.com:yourusername/my-vault.git"  # ← your repo
```

Test it manually:
```bash
~/bin/vault-sync.sh
```

Expected output:
```
[vault-sync] 2026-05-20 08:00:01 — starting
[vault-sync] committing local changes
[vault-sync] pulling from GitHub
[vault-sync] pushing to GitHub
[vault-sync] done
```

Check GitHub — you should see a fresh commit timestamp.

## Step 3: Wire it to a LaunchAgent (runs automatically every 15 minutes)

Create the LaunchAgent plist:

```bash
cat > ~/Library/LaunchAgents/com.yourname.vault-sync.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.yourname.vault-sync</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-c</string>
    <string>/Users/YOURUSERNAME/bin/vault-sync.sh >> /Users/YOURUSERNAME/Library/Logs/vault-sync.log 2>&1</string>
  </array>
  <key>StartInterval</key>
  <integer>900</integer>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
EOF
```

Replace `YOURUSERNAME` with your actual Mac username (run `whoami` if unsure).

Load it:
```bash
launchctl load ~/Library/LaunchAgents/com.yourname.vault-sync.plist
```

Verify it's running:
```bash
launchctl list | grep vault-sync
```

You should see a line with your plist name. The `0` in the first column means it's running without error.

Check the log after 15 minutes:
```bash
tail ~/Library/Logs/vault-sync.log
```

## Step 4: Test the full chain

1. Make a small edit to any note in Obsidian (add a word, save)
2. Wait up to 15 minutes (or run `~/bin/vault-sync.sh` manually)
3. Check github.com/yourusername/my-vault — you should see the commit

If the commit is there: the chain works. The pipeline will be able to read your vault.

## How the pipeline reads vault content

The Worker reads from GitHub via the API. Example — reading a specific file:

```ts
const response = await fetch(
  `https://api.github.com/repos/yourusername/my-vault/contents/Journal/today.md`,
  {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github.raw",
    },
  }
);
const noteContent = await response.text();
```

For reading multiple files (e.g., all journal entries from the last week):
- Use the GitHub API's contents endpoint to list a directory
- Filter by file modification date
- Read each file
- Concatenate and pass to Claude

The tutor will help you write this code when you reach the vault-integration step. The important thing now is that the sync path is solid.

## Vault folder structure (recommended)

```
Your Vault/
├── Inbox/                ← quick captures (Siri shortcuts, mobile, voice)
├── Pipeline/
│   ├── Output/           ← daily brief notes written back by the pipeline
│   └── Focus.md          ← "what I'm focused on this week" (pipeline reads this)
├── Journal/              ← daily notes
├── Projects/             ← active project notes
├── Resources/            ← reference material (PDFs processed by Codex later)
└── Archive/              ← done or dormant
```

The pipeline doesn't need to read everything. Point it at the folders that have fresh, relevant content — usually `Journal/` and `Pipeline/Focus.md`.

## Obsidian Sync vs. GitHub

These are separate systems:
- **Obsidian Sync**: syncs your vault between your Mac and your iPhone/iPad continuously. Does not involve GitHub.
- **vault-sync.sh + GitHub**: syncs your Mac vault to GitHub every 15 minutes. The pipeline reads from GitHub.

Mobile edits (on your phone or iPad via Obsidian Sync) reach your Mac via Obsidian Sync, then reach GitHub on the next vault-sync.sh run. For pipeline-critical notes (like `Focus.md`), edit on your Mac for the fastest path to GitHub.

## SSH vs. HTTPS for GitHub

The example above uses HTTPS (`https://github.com/...`). If you prefer SSH (`git@github.com:...`) and have an SSH key configured, use the SSH URL instead. Either works; pick whichever you already have set up.

For GitHub API calls from the Worker (reading file contents), you'll need a GitHub Personal Access Token — the Worker can't use SSH. Create one at github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Repository contents (read-only). Store it as a Worker secret (`GITHUB_TOKEN`).

## If the sync breaks

Common causes and fixes:

| Symptom | Cause | Fix |
|---|---|---|
| LaunchAgent not running | Plist syntax error or wrong path | `launchctl unload` + fix plist + `launchctl load` |
| Git authentication fails | Token expired or SSH key changed | Re-authenticate: `git config --global credential.helper osxkeychain` or update SSH key |
| Merge conflicts | Mobile edit and Mac edit to same file | Resolve manually: `cd vault && git mergetool` |
| Log shows nothing | LaunchAgent not loaded | Run `launchctl list \| grep vault-sync`; if empty, reload |

Check logs first: `tail ~/Library/Logs/vault-sync.log`. The log will tell you what failed.
