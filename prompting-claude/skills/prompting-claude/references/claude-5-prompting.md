# Claude 5 prompting: distilled cross-model reference

Offline distillation of Anthropic's official prompting docs for Claude's latest models: the [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) page and the blog post [The new rules of context engineering for Claude 5 generation models](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models). This file is the fallback knowledge base for the `prompting-claude` skill, covering techniques that apply to **all** current Claude models (Fable 5, Mythos 5, Opus 5, Opus 4.8, Sonnet 5, and the Haiku 4.5 and 4.x tiers). Per-model tuning is in `model-tuning.md`. Snippets are reproduced so the skill produces the same quality of prompt offline; treat the live docs as the source of truth when connected.

---

## 1. Context engineering for Claude 5 (read this first)

Context is everything the model sees: system prompt, tools, Skills, CLAUDE.md, memory, references, the conversation. Current models were being **over-constrained**. Anthropic removed **over 80%** of Claude Code's system prompt for Claude 5 models with no measured loss on coding evals. The optimization is **subtraction**: trust the model's judgment and give it good interfaces, rather than enumerating rules.

Six then → now shifts:

| Then (older models) | Now (Claude 5 generation) |
| :-- | :-- |
| **Give Claude rules.** "Default to no comments. Never write multi-line comment blocks, one short line max." | **Let Claude use judgment.** "Write code that reads like the surrounding code: match its comment density, naming, and idiom." |
| **Give Claude examples.** Many few-shot demonstrations. | **Design interfaces.** Examples constrain the exploration space. Invest in tool/script/file design and expressive parameter names. A Todo tool whose `status` is an enum (`pending`, `in_progress`, `completed`) teaches usage without prose. |
| **Put it all upfront.** Everything in one large context. | **Progressive disclosure.** Move verification, review, and niche guidance into selectively loaded Skills and deferred tools. Load a tree of files at the right time. |
| **Repeat yourself.** Duplicate key rules at the end of context. | **Simple tool descriptions.** Put tool instructions in the tool's own description, not duplicated in the system prompt. |
| **Memory in CLAUDE.md.** Manually saved via the `#` hotkey. | **Auto-memory.** The model saves and recalls relevant memories on its own. |
| **Simple specs.** Markdown plans. | **Rich references.** A spec can be a test suite, a function to port, an HTML mockup, or a rubric verified by a workflow. An HTML mockup beats a description or screenshot. |

**Applying it to the layers you control:**

- **System prompt** — tightly tied to your product. Rarely touched for Claude Code, but it is the highest-leverage surface when you build your own agent harness.
- **CLAUDE.md** — keep it lightweight. Briefly describe the repo, then spend most tokens on **gotchas** (e.g. "types are kept in one monolithic file"). Do not state the obvious. Use progressive disclosure heavily; do not build a "central repository" of every practice.
- **Skills** — treat as lightweight guides. Avoid over-constraining except in genuinely important areas. Split a long skill into many files. Skills are best when they encode opinions or knowledge particular to you or your team.
- **References** — `@`-mention files. Prefer instructions expressed *in code* for high fidelity; an HTML mockup generally beats a description.

**Anti-patterns:** conflicting instructions across layers; over-constraining a model that now has judgment; the central-repository myth; redundant tool references in both the system prompt and the tool description; over-relying on examples that narrow exploration.

---

## 2. General principles (all current models)

### Be clear and direct
Claude responds to clear, explicit instructions. Be specific about the desired output and constraints. If you want "above and beyond", **ask for it explicitly** rather than hoping the model infers it from a vague prompt. Provide steps as a numbered list when order or completeness matters.

**Golden rule:** show the prompt to a colleague with minimal context. If they would be confused, so is Claude.

- Less effective: `Create an analytics dashboard`
- More effective: `Create an analytics dashboard. Include as many relevant features and interactions as possible. Go beyond the basics to create a fully-featured implementation.`

### Add context and motivation
Explaining *why* lets the model generalize.

- Less effective: `NEVER use ellipses`
- More effective: `Your response will be read aloud by a text-to-speech engine, so never use ellipses since the text-to-speech engine will not know how to pronounce them.`

### Use examples effectively
A few well-crafted examples (few-shot / multishot) steer format, tone, and structure. Make them **relevant** (mirror the real use case), **diverse** (cover edge cases, vary so the model does not latch onto an unintended pattern), and **structured** (wrap each in `<example>`, the set in `<examples>`). 3 to 5 examples is a good target. On Claude 5, weigh examples against interface design: examples constrain the model's exploration, so prefer expressive tools/parameters when the goal is capability rather than a fixed output shape.

### Structure with XML tags
XML tags let Claude parse a prompt that mixes instructions, context, examples, and inputs. Wrap each type in its own tag (`<instructions>`, `<context>`, `<input>`). Use consistent, descriptive names; nest when there is a natural hierarchy.

### Give Claude a role
A single system-prompt sentence focuses tone and behavior: `You are a helpful coding assistant specializing in Python.`

### Long-context prompting (20k+ tokens)
- **Put longform data at the top**, above the query, instructions, and examples. Queries at the end can improve quality by up to ~30% on complex multi-document inputs.
- **Structure documents with XML:** wrap each in `<document index="n">` with `<source>` and `<document_content>` subtags.
- **Ground in quotes:** ask Claude to extract relevant quotes into `<quotes>` tags first, then answer from them.

### Model self-knowledge
To make Claude identify itself or default to a model string:
```text
The assistant is Claude, created by Anthropic. The current model is Claude Opus 5.
```
```text
When an LLM is needed, please default to Claude Opus 5 unless the user requests otherwise. The exact model string for Claude Opus 5 is claude-opus-5.
```

---

## 3. Output and formatting

### Verbosity
Current models are more concise, direct, and grounded (fact-based progress, less self-celebration), and may skip a verbal summary after a tool call. If you want visibility:
```text
After completing a task that involves tool use, provide a quick summary of the work you've done.
```
Exception: **Opus 5** runs longer by default and effort does not reliably shorten visible text; prompt for conciseness explicitly (see `model-tuning.md`).

### Control format with positive framing
- Not "Do not use markdown" → "Your response should be composed of smoothly flowing prose paragraphs."
- Use XML format indicators: "Write the prose in `<smoothly_flowing_prose_paragraphs>` tags."
- Match prompt style to output style: removing markdown from the prompt reduces markdown in the output.
- For strict control, a detailed directive works:
```text
<avoid_excessive_markdown_and_bullet_points>
When writing reports, documents, technical explanations, analyses, or any long-form content, write in clear, flowing prose using complete paragraphs and sentences. Use standard paragraph breaks for organization and reserve markdown primarily for `inline code`, code blocks, and simple headings (## and ###). Avoid using **bold** and *italics*.

DO NOT use ordered lists (1. ...) or unordered lists (*) unless: a) you're presenting truly discrete items where a list format is the best option, or b) the user explicitly requests a list or ranking

Instead of listing items with bullets or numbers, incorporate them naturally into sentences. NEVER output a series of overly short bullet points.
</avoid_excessive_markdown_and_bullet_points>
```

### LaTeX
Current models default to LaTeX for math. For plain text:
```text
Format your response in plain text only. Do not use LaTeX, MathJax, or any markup notation such as \( \), $, or \frac{}{}. Write all math expressions using standard text characters (e.g., "/" for division, "*" for multiplication, and "^" for exponents).
```

### Prefilled responses are removed
Starting with Claude 4.6 models and Mythos Preview, a prefilled **final** assistant turn returns a **400**. Migrate:
- **Force a format** → use [Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), or just ask (newer models match complex schemas reliably); for classification use a tool with an enum field.
- **Skip a preamble** → "Respond directly without preamble. Do not start with phrases like 'Here is...', 'Based on...'." Or output within XML tags / a tool call; strip stragglers in post.
- **Avoid a bad refusal** → clear prompting in the `user` message is now enough.
- **Continue an interrupted response** → move it to the user turn: "Your previous response was interrupted and ended with `[previous_response]`. Continue from where you left off."
- **Context hydration** → inject reminders into a user turn, or hydrate via tools / during compaction.

---

## 4. Tool use

Current models follow instructions precisely and benefit from explicit direction to act.
- "Can you suggest some changes" → the model may only suggest. "Change this function to improve its performance" → it acts.
- Proactive by default:
```text
<default_to_action>
By default, implement changes rather than only suggesting them. If the user's intent is unclear, infer the most useful likely action and proceed, using tools to discover any missing details instead of guessing.
</default_to_action>
```
- Conservative by default:
```text
<do_not_act_before_instructions>
Do not jump into implementation or change files unless clearly instructed to make changes. When the user's intent is ambiguous, default to providing information, research, and recommendations rather than taking action.
</do_not_act_before_instructions>
```
- **Dial back aggressive language.** On Opus 4.5/4.6+ prompts tuned to fight under-triggering now **overtrigger**. Replace "CRITICAL: You MUST use this tool when..." with "Use this tool when...".

### Parallel tool calls
Independent calls run in parallel. Push to ~100% or tune aggression:
```text
<use_parallel_tool_calls>
If you intend to call multiple tools and there are no dependencies between the calls, make all of the independent calls in parallel. For example, when reading 3 files, run 3 tool calls in parallel. However, if some calls depend on previous calls for their parameters, call them sequentially. Never use placeholders or guess missing parameters.
</use_parallel_tool_calls>
```

---

## 5. Thinking and reasoning

**Adaptive thinking** (`thinking:{type:"adaptive"}`) is the current mode: Claude decides when and how much to think, scaled by `effort` and query complexity. It beats manual extended thinking in internal evals. Defaults by model: **on** by default on Opus 5 and Sonnet 5; **always on** on Fable 5 / Mythos 5; **off unless set** on Opus 4.6 through 4.8 and Sonnet 4.6.

- **Prefer general instructions over prescriptive steps.** "Think thoroughly" often beats a hand-written plan; the model's reasoning frequently exceeds what a human would prescribe.
- **Multishot works with thinking.** Show reasoning patterns in `<thinking>` tags inside few-shot examples.
- **Manual CoT is a fallback only for thinking-off.** With thinking on, do not hand-write chain-of-thought. On Opus 5 keep thinking on at low effort instead of disabling it. On Fable 5 / Mythos 5, instructions to reproduce reasoning trip the `reasoning_extraction` refusal (see `model-tuning.md`).
- **Self-check**, except on Opus 5, which self-verifies (adding the instruction causes over-verification).

Curb overthinking (seen on Opus 4.6 at higher effort):
```text
When you're deciding how to approach a problem, choose an approach and commit to it. Avoid revisiting decisions unless you encounter new information that directly contradicts your reasoning. If you're weighing two approaches, pick one and see it through. You can always course-correct later if the chosen approach fails.
```
For overtriggered thinking on a large system prompt:
```text
Thinking adds latency and should only be used when it will meaningfully improve answer quality, typically for problems that require multistep reasoning. When in doubt, respond directly.
```
`budget_tokens` is deprecated on 4.6/Sonnet 4.6 and returns a **400** on 4.7+. Use `effort`; `max_tokens` is the hard ceiling.

---

## 6. Agentic systems

### Long-horizon and state tracking
Claude maintains orientation across long sessions by making incremental progress and saving state, especially across multiple context windows. Sonnet 5, Sonnet 4.6/4.5, and Haiku 4.5 have **context awareness** (they track their own remaining token budget).

Tell the model your harness compacts, or it may wrap up early:
```text
Your context window will be automatically compacted as it approaches its limit, allowing you to continue working indefinitely from where you left off. Therefore, do not stop tasks early due to token budget concerns. As you approach your token budget limit, save your current progress and state to memory before the context window refreshes. Never artificially stop any task early regardless of the context remaining.
```

Across multiple windows: use the first window to set up (tests, `init.sh`); write tests in a structured file (`tests.json`) and forbid editing them; prefer a **fresh** window over compaction (the model rediscovers state from the filesystem) and be prescriptive on startup ("Call pwd", "Review progress.txt, tests.json, git logs"); use git and structured state files; emphasize incremental progress.

### Autonomy and safety
Confirm before irreversible or shared-system actions:
```text
Consider the reversibility and potential impact of your actions. Take local, reversible actions like editing files or running tests freely, but for actions that are hard to reverse, affect shared systems, or could be destructive, ask the user before proceeding.
Examples that warrant confirmation: deleting files or branches, dropping tables, rm -rf; git push --force, git reset --hard, amending published commits; pushing code, commenting on PRs, sending messages, modifying shared infra.
When encountering obstacles, do not use destructive actions as a shortcut (e.g. --no-verify), and do not discard unfamiliar files that may be in-progress work.
```

### Subagents
Current models orchestrate subagents natively and delegate without being told. Watch for **overuse** (Opus 4.6 and Opus 5 over-delegate; see `model-tuning.md`). Guidance when it is excessive:
```text
Use subagents when tasks can run in parallel, require isolated context, or involve independent workstreams that don't need to share state. For simple tasks, sequential operations, single-file edits, or tasks where you need to maintain context across steps, work directly rather than delegating.
```

### Overengineering
Current Opus models tend to overbuild. Constrain:
```text
Avoid over-engineering. Only make changes that are directly requested or clearly necessary.
- Scope: Don't add features, refactor, or make "improvements" beyond what was asked. A bug fix doesn't need surrounding cleanup.
- Documentation: Don't add docstrings, comments, or type annotations to code you didn't change. Only comment where logic isn't self-evident.
- Defensive coding: Don't add error handling or validation for scenarios that can't happen. Trust internal code and framework guarantees. Only validate at system boundaries.
- Abstractions: Don't create helpers or abstractions for one-time operations. The right amount of complexity is the minimum needed for the current task.
```

### Generalize, don't hardcode tests
```text
Please write a high-quality, general-purpose solution. Implement a solution that works correctly for all valid inputs, not just the test cases. Do not hard-code values or special-case the tests. Tests verify correctness, they do not define the solution. If the task is infeasible or a test is wrong, tell me rather than working around it.
```

### Minimize hallucination in coding
```text
<investigate_before_answering>
Never speculate about code you have not opened. If the user references a specific file, you MUST read it before answering. Investigate relevant files BEFORE answering questions about the codebase. Never make claims about code before investigating unless you are certain.
</investigate_before_answering>
```

### Reduce net-new files
```text
If you create any temporary new files, scripts, or helper files for iteration, clean up these files by removing them at the end of the task.
```

### Chaining
Adaptive thinking and native subagents handle most multistep work internally. Explicit chaining (separate API calls) still helps when you must inspect intermediate output or enforce a pipeline. Most common pattern: **self-correction** (draft → review against criteria → refine).

---

## 7. Migration considerations

When moving prompts from earlier generations:
1. Be specific about desired behavior and output.
2. Add quality/detail modifiers ("Go beyond the basics to create a fully-featured implementation").
3. Request features (animations, interactivity) explicitly.
4. Move to **adaptive thinking**; control depth with `effort`, not `budget_tokens`.
5. Remove **prefilled** final assistant turns.
6. **Tune down anti-laziness prompting** — current models are proactive and overtrigger on "be thorough" / "if in doubt, use [tool]" language written for older models.

Per-model migration notes and API-invalid constructs are in `model-tuning.md`.
