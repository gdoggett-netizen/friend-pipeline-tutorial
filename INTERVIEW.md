# The Interview — Phase 1 of the Pipeline Tutor

> **For the tutor:** Walk through these in order. Ask one or two questions per turn — never the whole list at once. Paraphrase the student's answer back to them to confirm you heard it right. By the end, fill out `pipeline-spec.md` in their voice.
>
> **For the student:** There are no wrong answers. These questions surface things you already know about how you work. If you don't know an answer yet, "I'm not sure" is a fine response — we'll come back to it.
>
> **Note:** Before this interview, confirm that the Obsidian vault is connected to GitHub (Phase 0 in CLAUDE.md). The vault check comes first. This interview comes second.

---

## Block A — Why you're here

Tone: warm, zero jargon. Goal: make sure they're building their pipeline, not someone else's.

**A1. You just finished your second brain. What's sitting in that vault that you wish the pipeline could do something with automatically?**

Listen for: specific content (highlights, notes, journal entries, project status). This is the bridge — they built the vault, now they want it to *do* something. A specific frustration is gold. Abstract curiosity needs a follow-up.

**A2. What's something you do most weeks that you wish would just happen on its own?**

Listen for: anything *concrete and recurring*. Bad target: "keep up with news" (too vague). Good target: "skim my Readwise highlights and pull out 3 things to act on" (clear input, clear output, repetitive enough to automate). Also good: "every morning I want to know what's most important for the day, but I spend 45 minutes figuring it out."

**A3. If this pipeline did ONE tiny thing perfectly for you in 30 days, what would that be?**

This is the spec in disguise. Their answer = the v1 you'll build. Don't let them say two things.

---

## Block B — Inputs

Goal: identify ONE input source for v1. Push back gently on "all of these" — pick one.

**B1. What information sources do you check most regularly that you'd want the pipeline to read?**

Help them name them concretely. Suggest if they're stuck:
- Readwise (highlights from books, articles, podcasts)
- A Notion database
- Google Docs / Google Sheets
- An RSS feed (newsletter, blog, podcast)
- Their Obsidian vault (journal entries, project notes, recent captures)
- Email (a specific label, sender, or folder)
- Slack (a specific channel)
- GitHub PRs / issues
- A calendar (Google, iCal)
- Twitter/X saves or lists (note: API access costs money — defer to v2 unless they already have it)

**B2. Of those, which one is the most important AND easiest to reach from the internet?**

The v1 input needs to be reachable from a Cloudflare Worker (HTTP calls only — no local files). Readwise, Notion, GitHub, RSS, Gmail API all work. Local files on their Mac don't work for the cloud pipeline — but `vault-sync.sh` solves this for Obsidian content by pushing it to GitHub first.

If they want to use their vault as input: great. Just confirm the vault is on GitHub (Phase 0) and the pipeline reads from there.

**B3. How often does new data show up in that source?**

Drives the cron schedule. New data daily → daily cron. New data hourly → hourly cron. New data only on weekdays → weekday-only cron. Match the schedule to the natural rhythm of the data.

---

## Block C — Output

Goal: identify ONE output destination for v1.

**C1. When the pipeline produces something — a summary, a proposal, an alert — where do you most want to see it?**

Suggest if stuck:
- Email (lowest friction, the right default)
- Telegram bot (Greg's system uses this — simple and phone-friendly)
- Slack DM
- A web page at a URL they bookmark
- A note written back into their Obsidian vault (pipeline reads vault AND writes to it — nice loop)
- iOS push notification (requires Apple Developer Program enrollment — defer to v2)

**C2. Is email OK for v1, even if you eventually want something fancier?**

Email is the correct default. It's free, reliable, on every device, and easy to build keep/reject buttons into. Push, Slack, dashboards add complexity. Ship email for v1, upgrade later. If they push hard for non-email, ask why — "I get too much email" is legitimate, and Telegram is the next-easiest path.

**C3. When you see the output, what do you typically want to do with it?**

"Read and forget" → no decision loop needed yet, simpler v1.
"Decide whether to act on each item" → keep/reject buttons, build the decision loop in Phase 3.
"Save for later" → bookmark link + optional note back to vault.

Match the loop design to their natural response.

---

## Block D — Identity

Goal: pin down the *shape* of the work. This shapes the system prompt more than anything else.

**D1. Which of these best describes what you want the pipeline to be?**

- **The Synthesizer.** Takes lots of inputs, produces a short focused output. ("Read my last week of highlights, give me 3 themes.")
- **The Scout.** Watches a source for things matching a pattern, alerts when it sees one. ("Tell me when there's news about X.")
- **The Coach.** Looks at *me* — my notes, my decisions, my work — and proposes what to do next. ("Based on my last 20 journal entries, what should I focus on this week?") — needs vault access, more personal.
- **The Librarian.** Captures, tags, and files things so I can find them later. ("Take this, summarize it, file it under the right project in my vault.")

Most beginners want Synthesizer or Scout for v1. Coach and Librarian are usually v2+ — they need more vault infrastructure.

**D2. How opinionated should the pipeline be?**

- **Low**: "just summarize, don't editorialize" — Claude is a lens, not a judge
- **Medium**: "highlight what looks important, but I make the call" — Claude ranks, student decides
- **High**: "rank, propose, even pre-decide — I'll override when I disagree" — needs the decision loop early, because you're *teaching it your taste*

**D3. What kinds of mistakes are you most worried about it making?**

Listen for: "wrong information" (apply empty > wrong rule), "wasting my time with noise" (build rejection tracking), "missing things" (Scout pattern + broader inputs), "being too pushy" (lower opinion, defer decision loop).

Whatever they say goes into the system prompt as an explicit rule.

---

## Block E — Vault integration

Goal: understand how deeply they want the pipeline to connect to their second brain.

**E1. Do you want the pipeline to read from your vault? Write to it? Both?**

- Read only: pipeline reads journal entries or project notes as context for its proposals. Simple — just set up vault-sync.sh and have the pipeline pull specific files from GitHub.
- Write only: pipeline outputs a daily brief note into the vault. Simple — Worker writes a markdown file to the repo via GitHub API.
- Both: pipeline reads vault, writes results back. The full loop. Greg's system works this way. Worth building if they're committed to the vault as their second brain.

**E2. What folders in your vault are most "alive" right now?**

This tells you which folders are worth the pipeline reading. Someone who journals daily → journal folder. Someone with active projects → projects folder. Don't scan the whole vault — scan the folders that have fresh content.

**E3. Is there a note you update regularly that you'd want the pipeline to always know about?**

An "intentions" note, a "current focus" note, a "this week's goals" note — these are powerful inputs. The pipeline reads it on every run and can tailor its proposals accordingly. Greg's system has something like this. Worth building if the student writes in the vault regularly.

---

## Block F — Comfort and cadence

Goal: calibrate the teaching pace.

**F1. How comfortable are you in a terminal? (1 = "what's a terminal", 10 = "I live there")**

1–3: explain every command before running it. Full paths. Show file structure with `ls` after changes.
4–6: explain new commands, assume familiarity after that.
7+: shorthand is fine. They'll ask.

**F2. Have you written any code before? HTML, Python, a shell script — anything counts.**

If yes: use it as the reference frame ("a Worker handler is like a Flask route", "KV is like a Python dict that persists").
If no: use real-world analogies. Cron = kitchen timer. KV = sticky note. Worker = vending machine. Cron fires, Worker wakes up, Worker does a thing, Worker goes back to sleep.

**F3. How much time per session do you want to spend on this?**

15–30 min/session → small steps, 1–2 weeks to ship v1. Explain everything.
1 hour/session → one full lesson per session, ship v1 in 3–5 sessions.
Weekend marathon → ship v1 today, decision loop tomorrow, polish next weekend.

Match cadence to expectation. Don't promise faster than they can absorb.

---

## Block G — Nerves and questions

**G1. Is there anything you're nervous about, or any question you want to ask before we start building?**

Common responses and how to handle them:

- "I don't know anything about this" → that's exactly who this tutor is for. You'll go at their pace.
- "What will it cost?" → point at the README cost guide. Free tier covers v1 entirely. After that, ~$0–$0.50/month with prompt caching.
- "What if I break something?" → show them `npx wrangler rollback`. Nothing they can do is permanent.
- "How long will this take?" → phase 1 (interview + v1) is 2–4 sessions. Decision loop is 1–2 more. Polish is open-ended. They can stop after v1 and have something genuinely useful.
- "What about my existing vault — will this mess it up?" → no. The pipeline reads from GitHub (read-only unless they ask for vault write). vault-sync.sh only pushes. Their vault is safe.

---

## Output: pipeline-spec.md

When the interview is done, write `pipeline-spec.md` in the project root. Template:

```markdown
# [Student's Name]'s Pipeline — Spec v1

## The job (one sentence, in their voice)
> "Every morning at 8am, read my Readwise highlights from the last 24h and email me the top 3 things to act on."

## Inputs
- **[Source]** — [what it provides]
- Auth: [token name] (will go in Worker secret as [SECRET_NAME])

## Vault integration
- Read: [yes/no — which folders]
- Write: [yes/no — where output notes go]
- vault-sync.sh: [set up / not set up yet]

## Output
- **[Destination]** to [address/channel]
- Each output contains: [describe what they'll see]
- Decision buttons: [keep/reject per item / no buttons for v1]

## Cadence
- Cron: `[UTC expression]` ([local time translation])
- Idempotency key: `last-run-date` in KV

## Identity
- **Type**: [Synthesizer / Scout / Coach / Librarian]
- **Opinion level**: [Low / Medium / High]
- **Failure modes to guard against**:
  - [List what the student was worried about]

## What's NOT in v1 (deferred)
- Decision loop — Phase 3
- Prompt caching — Phase 4
- Heartbeat watcher — Phase 4
- [Anything they wanted but agreed to defer]

## Open questions
- [Anything they couldn't answer yet]

## Working agreement
- Terminal comfort: [score]/10
- Code experience: [yes/no, language if yes]
- Cadence: [time per session]
- Pace: [explain everything / explain once / shorthand OK]
- Timezone: [their timezone, for UTC cron conversion]
```

Show the spec to the student. Iterate until they say "yes, that's it." Then save it. Then move to Phase 2.
