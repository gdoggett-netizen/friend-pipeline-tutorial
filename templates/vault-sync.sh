#!/bin/zsh
# vault-sync.sh — syncs your Obsidian vault to GitHub
# Based on Greg's production script, running since May 2026.
#
# Setup:
#   1. Set VAULT_PATH and GITHUB_REPO below
#   2. cp this file to ~/bin/vault-sync.sh && chmod +x ~/bin/vault-sync.sh
#   3. Test: ~/bin/vault-sync.sh
#   4. Wire to LaunchAgent (see lessons/10-obsidian-github-vault.md)

# ── Configure these two lines ──────────────────────────────────────────────
VAULT_PATH="$HOME/your-vault"                            # path to your Obsidian vault
GITHUB_REPO="https://github.com/yourusername/your-vault.git"  # your vault's GitHub repo
# ──────────────────────────────────────────────────────────────────────────

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
LOG_PREFIX="[vault-sync] $TIMESTAMP"

echo "$LOG_PREFIX — starting"

# Verify the vault directory exists
if [ ! -d "$VAULT_PATH" ]; then
  echo "$LOG_PREFIX — ERROR: vault not found at $VAULT_PATH"
  exit 1
fi

cd "$VAULT_PATH" || exit 1

# Commit any local Obsidian edits
if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  echo "$LOG_PREFIX — committing local changes"
  git add -A
  git commit -m "vault sync $TIMESTAMP" --quiet
else
  echo "$LOG_PREFIX — no local changes"
fi

# Pull from GitHub (local changes win conflicts)
echo "$LOG_PREFIX — pulling from GitHub"
if ! git pull --no-rebase -X ours --quiet 2>&1; then
  echo "$LOG_PREFIX — WARNING: pull had issues, continuing"
fi

# Push to GitHub
echo "$LOG_PREFIX — pushing to GitHub"
if git push --quiet 2>&1; then
  echo "$LOG_PREFIX — done"
else
  echo "$LOG_PREFIX — ERROR: push failed. Check git credentials and repo access."
  exit 1
fi
