# Lesson 05 — Claude API Basics

> Introduce before the student calls Claude from their Worker for the first time. Cover the essentials only — save caching for lesson 06.

---

## What you're doing

Instead of typing to Claude in a chat window, you're writing code that calls Claude programmatically. The same model, the same intelligence — but your Worker sends the request automatically, on a schedule, without you sitting at a keyboard.

## The minimum API call

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  system: "You are a daily brief assistant. Be concise and actionable.",
  messages: [
    {
      role: "user",
      content: "Here are today's highlights: [your content here]. Summarize the top 3.",
    },
  ],
});

const text = response.content[0].text;
// → the text of Claude's response
```

That's it. The rest is refinement.

## Default model: Sonnet 4.6

**Use `claude-sonnet-4-6` for everything in your pipeline.** It's:
- Fast (typically 5–15 seconds for a pipeline-sized response)
- Smart enough for 90% of pipeline tasks: summarization, extraction, classification, scoring
- Cheap (especially with prompt caching, lesson 06)

When to consider Opus 4.7 instead:
- The task involves genuinely novel synthesis across many sources
- The output goes directly to a stakeholder without your review
- You've tested Sonnet on this exact task and the quality isn't good enough

For v1: Sonnet. Always.

## The system prompt vs. the user message

Think of it this way:
- **System prompt**: your standing instructions. Who Claude is, what the job is, what rules to follow. This is what gets cached (lesson 06) — it should be the same every run.
- **User message**: today's specific inputs. The highlights, the articles, the vault notes, the date. This changes every run.

```ts
const SYSTEM_PROMPT = `You are a morning brief assistant for [Name].

Your job: given a set of inputs, produce the top 3 most actionable items for today.

Rules:
- Return exactly 3 items, or fewer if fewer are relevant. Never more.
- Each item: one sentence of what it is, one sentence of why it matters.
- If you cannot verify a fact from the provided inputs, do not include it.
- Honor the user's recent decisions. Don't re-propose items they've rejected.
`;

// In the API call:
system: SYSTEM_PROMPT,         // stable — same every run
messages: [{
  role: "user",
  content: todaysInputsAsText,  // varies — different every run
}]
```

## Always set `max_tokens`

```ts
max_tokens: 1024,
```

If you don't set this, Claude can generate as many tokens as it wants up to the model's maximum. A buggy system prompt that triggers a long response can rack up unnecessary costs. Set `max_tokens` to roughly 1.5× what you expect. For "top 3 items," that's maybe 600–800 tokens — not 4096.

## Reading the response

```ts
const response = await client.messages.create({ ... });

// The text content (what Claude wrote):
const text = response.content[0].text;

// Token usage (important for monitoring costs):
console.log(`input: ${response.usage.input_tokens}`);
console.log(`output: ${response.usage.output_tokens}`);
console.log(`cache hit: ${response.usage.cache_read_input_tokens ?? 0}`);
```

Log token usage on every run. After a week, you'll know your typical cost per run. If it ever spikes unexpectedly, you'll notice.

## The ANTHROPIC_API_KEY secret

Your API key goes in Cloudflare as a secret — encrypted, never in your code or repo:

```bash
npx wrangler secret put ANTHROPIC_API_KEY --name your-worker-name
# Prompted for the value — paste your key, press enter
```

In the Worker, access it via `env.ANTHROPIC_API_KEY`. The Anthropic client picks it up automatically when you construct with `new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })`.

Where to get your API key: console.anthropic.com → API Keys → Create Key. If you're on Claude Pro or Max, you can use the API with included credits before you hit billing.

## What if Claude returns empty or garbled output?

Add a sanity check after every Claude call:

```ts
const text = response.content[0]?.type === "text" ? response.content[0].text : "";
if (!text || text.trim().length < 20) {
  console.error("Claude returned empty/short response");
  // Log the failure, don't send output, don't mark the run as successful
  return;
}
```

This protects against edge cases — API errors that return malformed responses, prompts that confuse the model, network blips. Catching it here prevents sending a garbled email.
