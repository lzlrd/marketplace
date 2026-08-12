# Per-model tuning: Fable 5, Mythos 5, Opus 5, Sonnet 5, Opus 4.8

Offline distillation of Anthropic's per-model prompting docs. Apply on top of the cross-model layer in `claude-5-prompting.md`. Each model performs well out of the box on the prior model's prompts; these are the behaviors that most often need tuning, plus copy-paste snippets. Add only what the target needs and remove legacy scaffolding it does not. Treat the live docs as the source of truth when connected.

---

## Defaults at a glance

| Model | Built for | Effort default | Thinking default | Notable API constraint |
| :-- | :-- | :-- | :-- | :-- |
| **Fable 5 / Mythos 5** | Hardest, longest-horizon, most ambiguous work | `high` (`xhigh` hardest; `low`/`medium` still strong) | Always on, adaptive only | No `budget_tokens`; `refusal` stop reason; summarized-only thinking |
| **Opus 5** | Complex agentic coding, long-horizon, enterprise | `high` (use `low`/`medium` liberally; `xhigh` for demanding) | On by default; disable only at effort ≤ `high` | — |
| **Sonnet 5** | Coding and agentic, cost-effective | `high` (`xhigh` hardest) | On by default; disable with `{type:"disabled"}` | No `temperature`/`top_p`/`top_k` (400); new tokenizer ~+30% tokens |
| **Opus 4.8** | Long-horizon agentic, knowledge work, vision, memory | `xhigh` for coding/agentic, min `high` for intelligence-sensitive | Off unless `{type:"adaptive"}` | Respects effort strictly at low end |

**Choosing a target when unnamed:** agentic coding, large refactors, long-horizon runs → Opus 5 or Fable 5 (Fable 5 for the hardest, multiday, or most ambiguous). General and cost-sensitive → Sonnet 5. Opus 4.8 is a secondary/legacy target and the automatic fallback when Fable 5 refuses. Effort is the primary intelligence/latency/cost lever on all of them; re-run an effort sweep on your own evals rather than carrying a prior model's default over.

---

## Fable 5 / Mythos 5

Takes on problems previously too complex, long-running, or ambiguous. Best applied to your **hardest unsolved problems**; testing only on simple workloads undersells it. Individual requests can run many minutes at higher effort; autonomous runs, hours. Adjust client timeouts, streaming, and progress indicators, and check on runs asynchronously rather than blocking. Instruction-following is strong enough to steer whole behaviors with a **brief** instruction rather than enumerating each one; skills written to be prescriptive for older models often degrade Fable 5 and are worth removing.

**Refusals:** Fable 5 runs safety classifiers for offensive cybersecurity, biology/life-sciences, and extraction of its summarized thinking. Benign work in those areas can also trip them, returning `stop_reason: "refusal"`. Configure server- or client-side fallback to Opus 4.8.

Keep it from over-planning ambiguous tasks:
```text
When you have enough information to act, act. Do not re-derive facts already established in the conversation, re-litigate a decision the user has already made, or narrate options you will not pursue in user-facing messages. If you are weighing a choice, give a recommendation, not an exhaustive survey. This does not apply to thinking blocks.
```

Prevent unrequested tidying/refactoring at higher effort:
```text
Don't add features, refactor, or introduce abstractions beyond what the task requires. A bug fix doesn't need surrounding cleanup and a one-shot operation usually doesn't need a helper. Don't design for hypothetical future requirements: do the simplest thing that works well. Don't add error handling, fallbacks, or validation for scenarios that cannot happen. Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs). Don't use feature flags or backwards-compatibility shims when you can just change the code.
```

Steer brevity (a short instruction is as effective as listing each pattern):
```text
Lead with the outcome. Your first sentence after finishing should answer "what happened" or "what did you find": the thing the user would ask for if they said "just give me the TLDR." Supporting detail and reasoning come after. Being readable and being concise are different things, and readability matters more.

The way to keep output short is to be selective about what you include (drop details that don't change what the reader would do next), not to compress the writing into fragments, abbreviations, arrow chains like A → B → fails, or jargon.
```

Ground progress claims (nearly eliminates fabricated status on long runs):
```text
Before reporting progress, audit each claim against a tool result from this session. Only report work you can point to evidence for; if something is not yet verified, say so explicitly. Report outcomes faithfully: if tests fail, say so with the output; if a step was skipped, say that; when something is done and verified, state it plainly without hedging.
```

State the boundaries (curbs unrequested actions):
```text
When the user is describing a problem, asking a question, or thinking out loud rather than requesting a change, the deliverable is your assessment. Report your findings and stop. Don't apply a fix until they ask for one. Before running a command that changes system state (restarts, deletes, config edits), check that the evidence actually supports that specific action.
```

Checkpoint only where it must:
```text
Pause for the user only when the work genuinely requires them: a destructive or irreversible action, a real scope change, or input that only they can provide. If you hit one of these, ask and end the turn, rather than ending on a promise.
```

Parallel subagents (Fable 5 dispatches them readily; prefer async, long-lived subagents):
```text
Delegate independent subtasks to subagents and keep working while they run. Intervene if a subagent goes off track or is missing relevant context.
```

Memory system (Fable 5 does well when it can record and reference lessons):
```text
Store one lesson per file with a one-line summary at the top. Record corrections and confirmed approaches alike, including why they mattered. Don't save what the repo or chat history already records; update an existing note rather than creating a duplicate; delete notes that turn out to be wrong.
```
Bootstrap it from history: `Reflect on the previous sessions we've had together. Use subagents to identify core themes and lessons, and store them in [X]. Make sure you know to reference [X] for future use.`

Autonomous pipelines (curbs rare early stopping / text-only "I'll now run X" without the call):
```text
You are operating autonomously. The user is not watching in real time and cannot answer questions mid-task, so asking "Want me to…?" will block the work. For reversible actions that follow from the original request, proceed without asking. Before ending your turn, check your last paragraph. If it is a plan, an analysis, a question, a list of next steps, or a promise about work you have not done ("I'll…", "let me know when…"), do that work now with tool calls. End your turn only when the task is complete or you are blocked on input only the user can provide.
```

Context-budget concern (Fable 5 may offer to hand off in very long sessions; avoid surfacing token countdowns, and if you must):
```text
You have ample context remaining. Do not stop, summarize, or suggest a new session on account of context limits. Continue the work.
```

Give the reason, not only the request:
```text
I'm working on [the larger task] for [who it's for]. They need [what the output enables]. With that in mind: [request].
```

Readability for the user after a long autonomous stretch:
```text
Terse shorthand is fine between tool calls (that's you thinking out loud). Your final summary is different: it's for a reader who didn't see any of that. Write it as a re-grounding, not a continuation of your working thread: the outcome first, then the one or two things you need from them, each explained as if new. Drop the working shorthand, write complete sentences, spell out terms, and don't use arrow chains or labels you made up earlier. When you mention files, commits, or flags, give each its own plain-language clause. If you have to choose between short and clear, choose clear.
```

Self-verification on long runs (fresh-context verifier subagents beat self-critique):
```text
Establish a method for checking your own work at an interval of [X] as you build. Run this every [X interval], verifying your work with subagents against the specification.
```

**`send_to_user` tool** — for long async agents that must surface content verbatim mid-turn without ending it. Tool inputs are never summarized, so the content arrives intact. Define the tool AND elicit it (Fable 5 rarely calls it unprompted):
```json
{
  "name": "send_to_user",
  "description": "Display a message directly to the user. Use this for progress updates, partial results, or content the user must see exactly as written before the task finishes.",
  "input_schema": {
    "type": "object",
    "properties": { "message": { "type": "string", "description": "The content to display to the user." } },
    "required": ["message"]
  }
}
```
```text
Between tool calls, when you have content the user must read verbatim (a partial deliverable, a direct answer to their question), call the send_to_user tool with that content. Use send_to_user only for user-facing content, not for narration or reasoning.
```

**Never** tell Fable 5 / Mythos 5 to echo, transcribe, or explain its internal reasoning as response text — it can trip the `reasoning_extraction` refusal and cause elevated fallbacks to Opus 4.8. For reasoning visibility, read the structured `thinking` blocks from adaptive thinking; for progress, use the `send_to_user` tool. Audit migrated skills and system prompts for reflection / show-your-thinking instructions.

---

## Opus 5

Strongest on **difficult** coding: multi-file features, larger refactors, end-to-end work. Completes full tasks rather than leaving stubs, and performs best given the **complete spec up front** and left to run. 1M-token context, default and max, with consistent instruction following throughout the window.

Verbose by default, and `effort` controls *thinking* volume, not visible length. Prompt for conciseness explicitly:
```text
Keep responses focused, brief, and concise. Keep disclaimers and caveats short, and spend most of the response on the main answer. When asked to explain something, give a high-level summary unless an in-depth explanation is specifically requested.
```
Reinforce near the end of a long system prompt:
```text
<tone_preference>
Keep outputs reasonably concise.
</tone_preference>
```

Progress-update cadence during agentic work:
```text
Before your first tool call, say in one sentence what you're about to do. While working, give a brief update only when you find something important or change direction. When you finish, lead with the outcome: your first sentence should answer "what happened" or "what did you find," with supporting detail after it for readers who want it.
```

Written deliverable length (files it writes to disk run long):
```text
Match the length of written documents to what the task needs: cover the substance, but do not pad with filler sections, redundant summaries, or boilerplate.
```

**Remove verification instructions.** Opus 5 self-verifies; carried-over "include a final verification step" / "verify with a subagent" / "double-check" / "re-verify" cause over-verification. Delete them, do not rewrite. Same for legacy harness scaffolding that adds a separate verification step.

Constrain scope for narrow tasks (Opus 5 can widen scope on its own judgment):
```text
Deliver what was asked, at the scope intended. Make routine judgment calls yourself, and check in only when different readings of the request would lead to materially different work. If the request seems mistaken or a better approach exists, say so in a sentence and continue with the task as asked rather than quietly narrowing, widening, or transforming it. Finish the whole task, and stop short of actions that are clearly beyond what was asked.
```

Cap subagent spawning (Opus 5 delegates readily; delegation multiplies cost on small tasks):
```text
Delegate to a subagent only for large tasks that are genuinely independent and parallelizable, such as a wide multi-file investigation. Do not delegate work you can finish yourself in a handful of tool calls, and do not use subagents to verify or double-check your own work. If one subagent can complete the task, use one rather than several, and keep spawn counts low.
```

Limit correction-narration to corrections that matter:
```text
Only correct an earlier statement when the error would change the user's code, conclusions, or decisions. State corrections plainly and briefly, then continue the task. For slips that change nothing for the user, make the fix and move on without noting it.
```

**Running with thinking disabled** (allowed only at effort ≤ `high`): the model can occasionally write a tool call as user-facing text (the call never runs, and the leaked text pollutes later turns) or emit `<thinking>`/other internal XML tags. Primary fix: **keep thinking on at `low` effort** rather than disabling. If you must disable, one combined instruction mitigates both, and do **not** name the tags:
```text
When you use a tool, you may say a brief sentence first. If no tool can express what the user asked for, say so instead of guessing. Do not include internal or system XML tags in your response.
```

Code review: report **everything**, filter later (never "only high-severity" or "be conservative", which Opus 5 follows literally):
```text
Report every issue you find, including ones you are uncertain about or consider low-severity. Do not filter for importance or confidence at this stage - a separate verification step will do that. Your goal here is coverage: it is better to surface a finding that later gets filtered out than to silently drop a real bug. For each finding, include your confidence level and an estimated severity so a downstream filter can rank them.
```

---

## Sonnet 5

Strong at coding and agentic tasks; well out of the box on Sonnet 4.6 prompts. Cost-effective: Sonnet 5 at `medium` ≈ Sonnet 4.6 at `high`, and Sonnet 5 at `high` ≈ Sonnet 4.6 at `max` (benchmark by observed thinking length, not effort name). Respects effort strictly at the low end (under-thinking risk on moderately complex tasks at `low`); raise effort rather than prompting around shallow reasoning.

Decrease verbosity (calibrated to complexity by default):
```text
Provide concise, focused responses. Skip non-essential context, and keep examples minimal.
```

**Adaptive thinking is on by default** (a change from Sonnet 4.6). Requests with no `thinking` field run with thinking. Disable entirely with `thinking:{type:"disabled"}`. If you ran thinking-off on 4.6, try thinking-on at a lower effort here. Steer thinking down on a large system prompt:
```text
Thinking adds latency and should only be used when it will meaningfully improve answer quality, typically for problems that require multistep reasoning. When in doubt, respond directly.
```
Manual extended thinking (`budget_tokens`) is removed and returns a **400**.

**`max_tokens`:** `max_tokens` is a hard cap on thinking + response text. The new tokenizer produces ~**30% more tokens** for the same text, so limits tuned for Sonnet 4.6 may truncate; at `high`/`xhigh`/`max` leave headroom or you may get a mostly-thinking response with a truncated answer and `stop_reason: "max_tokens"`.

Tool use: more agentic than 4.6 by default. With thinking **off** it is less likely to reach for tools; add an explicit nudge. Higher effort raises tool usage.

Literal instruction following (especially at low effort): state scope explicitly, e.g. `Apply this formatting to every section, not just the first one.`

Tone / variety: `temperature`, `top_p`, `top_k` at non-default values return a **400** (new for Sonnet-class). Steer tone and variety via the prompt. For a warmer voice:
```text
Use a warm, collaborative tone. Acknowledge the user's framing before answering.
```

Design / frontend defaults: Sonnet 5 can settle into a fixed house style on open-ended briefs. Generic "don't use that color" just shifts it to another fixed palette. Either specify a concrete alternative precisely, or (the recommended lever now that `temperature` is unavailable) have it propose options first:
```text
Before building, propose 4 distinct visual directions tailored to this brief (each as: bg hex / accent hex / typeface, plus a one-line rationale). Ask the user to pick one, then implement only that direction.
```
```text
<frontend_aesthetics>
NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white or dark backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character. Use unique fonts, cohesive colors and themes, and animations for effects and micro-interactions.
</frontend_aesthetics>
```

Code review (coverage prompt): same "report everything, filter later" language as Opus 5 above. Interactive coding: specify task, intent, and constraints up front in the first turn; use `xhigh`/`high` and reduce required user interactions. Computer use: `computer_20251124`, 1080p is a good performance/cost balance.

---

## Opus 4.8 (secondary target)

Strengths in long-horizon agentic work, knowledge work, vision, and memory. Effort matters more than on any prior Opus: `xhigh` for coding/agentic, a minimum of `high` for intelligence-sensitive work; `medium` for cost-sensitive; reserve `low` for short, scoped, latency-sensitive tasks (under-thinking risk on complex work). `max` can help but shows diminishing returns and can overthink. At `max`/`xhigh`, set `max_tokens` to at least 64k for room to think and act.

Decrease verbosity (calibrated to complexity by default):
```text
Provide concise, focused responses. Skip non-essential context, and keep examples minimal.
```

Thinking is **off** unless you set `thinking:{type:"adaptive"}`. Steer the adaptive trigger down if it thinks too often on a large system prompt:
```text
Thinking adds latency and should only be used when it will meaningfully improve answer quality — typically for problems that require multistep reasoning. When in doubt, respond directly.
```
If you must keep effort at `low` on a multistep task: `This task involves multistep reasoning. Think carefully through the problem before responding.`

Tool use: Opus 4.8 favors reasoning over tool calls (usually better results). Raise effort (`high`/`xhigh`) for substantially more tool use in agentic search and coding, or describe when/how to use a specific tool.

Literal instruction following: state scope explicitly. Subagents: Opus 4.8 spawns **fewer** by default; steer up when wanted:
```text
Do not spawn a subagent for work you can complete directly in a single response (e.g. refactoring a function you can already see).

Spawn multiple subagents in the same turn when fanning out across items or reading multiple files.
```

Tone: direct and opinionated with sparing emoji by default; re-evaluate style prompts against this baseline. For a warmer voice, use the Sonnet 5 warm-tone snippet above.

Design / frontend: strong default house style (warm cream `~#F4F1EA`, serif display type, italic accents, terracotta/amber), persistent and off for dashboards, fintech, healthcare, or enterprise. Specify a concrete alternative palette/typography precisely, or have it propose options first (same two levers as Sonnet 5). Opus 4.8 needs less frontend prompting than earlier models to avoid "AI slop"; the short `<frontend_aesthetics>` snippet above is enough.

Code review: same coverage prompt as Opus 5 / Sonnet 5. Interactive coding: it uses more tokens in interactive settings (reasons more after user turns); specify the task fully in the first turn and add an auto mode to reduce interactions. Computer use: up to 2576px / 3.75MP; 1080p is a good balance.

---

## API-invalid or removed constructs (strip these)

| Construct | Result | Use instead |
| :-- | :-- | :-- |
| Show-your-reasoning / echo internal reasoning (Fable 5, Mythos 5) | `reasoning_extraction` refusal → silent fallback to Opus 4.8 | Read structured `thinking` blocks; `send_to_user` for progress |
| Prefilled **final** assistant turn (4.6+, Mythos) | 400 error | Structured Outputs; "no preamble"; output in XML tags |
| `thinking.budget_tokens` (4.7+) | 400 error | Adaptive thinking + `effort`; `max_tokens` as ceiling |
| `temperature` / `top_p` / `top_k` (Sonnet 5) | 400 error | Steer tone/variety in the prompt |
| Disabling thinking above effort `high` (Opus 5) | Not allowed | Keep thinking on at lower effort |
| Over-verification / "double-check" (Opus 5) | Wasted tokens, no quality gain | Remove entirely |
| `CRITICAL:` / `You MUST` / "if in doubt, use [tool]" | Overtriggering on 4.5/4.6+ | Plain "Use this tool when..." |
