# [Your Name]'s Pipeline — Spec v1

> This file is filled in by the tutor during Phase 1 (the interview). It becomes the contract for everything built in Phases 2–4. The student confirms it before any code is written.

---

## The job (one sentence, in your voice)
> *[To be filled in during the interview — e.g., "Every morning at 7am, read my Readwise highlights from the last 24h and email me the top 3 things worth acting on."]*

## Inputs
- **[Source]** — [what it provides and how often it updates]
- Auth: [token name] → Worker secret as `[SECRET_NAME]`
- *[Add more sources here if v1 includes more than one — but try to start with one]*

## Vault integration
- **Read from vault**: [yes / no — which folders]
- **Write to vault**: [yes / no — where the output notes go]
- **vault-sync.sh**: [set up / not set up / in progress]
- **GitHub vault repo**: [URL]

## Output
- **Destination**: [email / Telegram / other] to [address or channel]
- **Each output contains**: [describe what lands in their inbox]
- **Decision buttons**: [keep/reject per item — Phase 3 / not in v1]

## Cadence
- **Cron**: `[UTC expression]` = [local time translation]
- **Idempotency key**: `last-run-date` in KV (CANON § 2.1)

## Identity
- **Type**: [Synthesizer / Scout / Coach / Librarian]
- **Opinion level**: [Low / Medium / High]
- **Failure modes to guard against**:
  - [What the student said they were worried about]
  - [Empty days — always send "nothing today" rather than silently skipping]

## What's NOT in v1 (deferred)
- Decision loop (D1 + keep/reject URLs) — Phase 3
- Prompt caching — Phase 4
- Heartbeat watcher — Phase 4
- [Anything the student wanted but agreed to defer]

## Open questions
- [Anything that couldn't be answered in the interview — come back to these]

## Working agreement
- **Terminal comfort**: [score]/10
- **Code experience**: [yes/no, language if yes]
- **Time per session**: [15 min / 1 hour / marathon]
- **Pace**: [explain everything / explain once / shorthand OK]
- **Timezone**: [their timezone, for UTC cron conversion]

---

*Last updated: [date]*
*Status: [interview / spec locked / v1 deployed / decision loop live / phase 4]*
