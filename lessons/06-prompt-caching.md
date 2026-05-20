# Lesson 06 — Prompt Caching

> Introduce in Phase 4, after v1 is deployed and working. This is an optimization, not a requirement to ship. But once the pipeline is running daily, it's required before you're paying real money.

---

## Why this matters

Your daily pipeline sends the same system prompt to Claude every single time it runs. Without caching, you pay for those tokens on every run. With caching, the second run onward costs ~10% of the first.

For a pipeline that runs 365 days a year with a 1,000-token system prompt:
- Without caching: 1,000 tokens × 365 = 365,000 input tokens/year
- With caching: ~1,000 tokens (first run) + ~100 tokens × 364 (cache hits) = ~37,400 input tokens/year
- Savings: ~90%

This is not a micro-optimization. Once you're past the free tier, this is the difference between paying $5/month and $50/month for the same pipeline.

## How to add it

One parameter change to your API call:

```ts
const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  cache_control: { type: "ephemeral" },  // ← add this
  system: SYSTEM_PROMPT,
  messages: [{ role: "user", content: todaysInputs }],
});
```

`cache_control: { type: "ephemeral" }` tells Claude to cache the last cacheable block — which is your system prompt, the largest stable prefix.

## Verifying it works

After adding caching, run the pipeline twice. On the second run:

```ts
console.log(`cache hit tokens: ${response.usage.cache_read_input_tokens ?? 0}`);
```

This number should be **greater than zero** on every run after the first. If it's zero every time, the cache is missing.

## The most common reason caching fails

A varying value in the cached prefix.

If your system prompt contains **anything that changes between runs**, the cache misses every time:

```ts
// WRONG — cache misses every run because the date changes
const SYSTEM_PROMPT = `Today is ${new Date().toLocaleDateString()}.
You are a morning brief assistant...`;

// CORRECT — system prompt is deterministic
const SYSTEM_PROMPT = `You are a morning brief assistant.
[your stable rules here]`;

// The date goes in the user message:
const userMessage = `Today is ${today}.\n\n${todaysInputs}`;
```

Things that break the cache:
- `Date.now()` or `new Date()` anywhere in the system prompt
- Random UUIDs
- Counters or incrementing values
- Any value from an external API that varies

Things that are safe in the system prompt (they don't vary run-to-run):
- Your rules and instructions
- The output format specification
- Fixed examples
- Your name, your goals, your preferences

## What "ephemeral" means

Anthropic caches the prompt for approximately 5 minutes after each use. Your daily pipeline runs once a day — the cache "resets" each run (re-cached for the next 5 minutes). For a pipeline that runs multiple times per hour, the cache pays off even more. For a daily pipeline, the savings are significant but each day starts a fresh cache entry.

## The cache in your logs

Add this to every pipeline run log:

```ts
console.log(
  `Claude: ${response.usage.input_tokens} in, ` +
  `${response.usage.output_tokens} out, ` +
  `${response.usage.cache_read_input_tokens ?? 0} cache hit, ` +
  `${response.usage.cache_creation_input_tokens ?? 0} cache write`
);
```

`cache_write` is > 0 on the first call (the cache is being created). `cache_read` is > 0 on subsequent calls (the cache is being used). If you see `cache_write > 0` every single run, your system prompt is varying between runs — investigate.
