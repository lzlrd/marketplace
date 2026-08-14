# Prompt Engineering: Distilled Reference

Offline distillation of the NotebookLM notebook *"Prompt Engineering in a Nutshell"* — promptingguide.ai / DAIR.AI, Google's *Prompt Engineering* whitepaper (Boonstra, Feb 2025) and Google Cloud prompt-engineering guide, and Anthropic's Claude prompting & context-engineering docs. This file is the fallback knowledge base for the `prompt-engineering` skill when the NotebookLM MCP is not connected. It contains the notebook's core techniques so the skill produces the same quality of prompt offline.

---

## 1. Anatomy of a prompt

A prompt is composed of up to four elements. Include the ones the task needs:

| Element | What it is |
| :-- | :-- |
| **Instruction** | The specific task the model must perform. Use a clear verb (Translate, Classify, Summarize, Extract…). |
| **Context** | External info that steers the model: background, domain data, retrieved documents, current date/time. |
| **Input data** | The specific text/question to act on. |
| **Output indicator** | The desired type/format of the result (e.g. `Sentiment:`, a JSON schema, a heading). |

Three prompt layers serve different purposes and can combine: a **system prompt** sets the model's overall purpose and capabilities (the "big picture"); a **contextual prompt** supplies immediate, task-specific, dynamic details; a **role prompt** frames identity, voice, and tone.

---

## 2. Core design principles

- **Start simple, then iterate.** Begin with a basic instruction; add context/examples as needed. Decompose genuinely complex tasks into subtasks.
- **Put the instruction at the top** of a normal-length prompt. Models attend most to the beginning and end of the input; lead with the task, put input/examples below. Optionally reinforce with a separator like `###`. *(Long-document prompts invert this — see §5.)*
- **Be specific and direct.** Spell out the desired outcome, format, length, style, and audience. "Use 2 to 3 sentences to explain X to a high-school student" beats "explain X briefly." Avoid ambiguity and over-cleverness. If you want "above and beyond" behavior, request it explicitly. When step order or completeness matters, number the steps.
- **Instructions over constraints.** Positive, actionable instructions outperform prohibitions: "Only discuss the console, company, year, and sales" beats "Do not list video game names." Reserve constraints for safety, legal bounds, or a strict output format — a pile of don'ts leaves the model guessing and can self-contradict.
- **Explain the why.** Give the motivation behind an instruction ("this summary is read aloud, so no formatting"); models generalize from the reason and deliver more targeted responses.
- **Match prompt style to desired output.** The prompt's own formatting steers the response's formatting: markdown-free prompts reduce markdown output. Mirror the layout you want back.
- **Prefer prompt optimization over knob-twiddling.** A well-crafted prompt usually beats fiddling with decoding settings.

---

## 3. LLM settings (decoding parameters)

Tune **one of each opposing pair**, not both. Prompt first; adjust these only when needed.

| Setting | Controls | Factual / precise | Creative / diverse |
| :-- | :-- | :-- | :-- |
| **Temperature** | Randomness: weight given to less-likely tokens | Low (→0): deterministic, factual | Higher: diverse; avoid >~1.5 (degrades to gibberish) |
| **Top_p** (nucleus) | Size of the token pool by cumulative probability | Low: only the most confident tokens | High: considers more, less-likely words |
| **Max length / tokens** | Cap on generated tokens | Cap to control length, cut irrelevance, bound cost | Same, bound length and cost |
| **Stop sequences** | String(s) that force generation to stop | Enforce structure (stop after code / at N items) | Set formatting endpoints |
| **Frequency penalty** | Penalizes a token ∝ how often it already appeared | Reduce repetition | Reduce repetition, vary vocabulary |
| **Presence penalty** | Uniform penalty for any token already used | Lower → stay on-topic | Higher → more varied/creative |

**Rules:** adjust temperature **or** top_p (not both); tune frequency **or** presence penalty (not both). For factual QA and CoT-style reasoning prompts, set temperature to 0 — there is usually one correct answer. A max-token cap **truncates**, it does not make the model concise: for short outputs, also ask for the length in the prompt ("in a tweet-length message"). Modern models repeat less, so penalties matter less than they used to, and some current models reject decoding parameters entirely — steer tone and variety with prompt instructions instead.

---

## 4. Core prompting techniques

| Technique | What it is | When to use |
| :-- | :-- | :-- |
| **Zero-shot** | Instruction only, no examples; relies on the model's pretraining + instruction tuning. | Common, foundational tasks (classification, summarization, extraction) the model already understands. Always try this first. |
| **Few-shot** | Include input→output demonstrations to enable in-context learning. | When zero-shot fails, when you need an exact format/tone/label, or the task is nuanced. Use **3 to 5** relevant, diverse, well-formatted examples (start around 6 for classification) and include edge cases. For classification, **mix the class order across examples** so the model learns each class's features, not the sequence. Wrap examples in `<example>` tags (a set in `<examples>`) so they can't be mistaken for instructions. |
| **Chain-of-Thought (CoT)** | Elicit intermediate reasoning steps before the answer. **Few-shot CoT:** show worked examples. **Zero-shot CoT:** append "Let's think step by step." | Complex arithmetic, commonsense, or symbolic reasoning where direct answers are wrong. Put the **answer after the reasoning** (the reasoning tokens condition the answer), keep the final answer extractable, and set temperature to 0. Non-reasoning-model targets only — for reasoning models (the default tier) see §7 and keep the prompt direct. |
| **Self-consistency** | Sample multiple diverse CoT reasoning paths, take the majority/most-consistent answer (replaces greedy decoding). | Hard reasoning tasks where accuracy is critical and one sample is unreliable. An orchestration-level technique (multiple API samples) — not a line to put inside a Gem/Project prompt; the same §7 gating applies. |

---

## 5. Structure & formatting

- **Delimiters.** Separate instruction, context, and input with clear markers: `###`, triple quotes `"""`, or XML-style tags (e.g. `<input>…</input>`, `<instructions>…</instructions>`). Use consistent, descriptive tag names; nest when content has a natural hierarchy. Prevents confusion about what to process vs. generate, and is a first-line defense against prompt injection.
- **Structured output.** For non-creative tasks (extraction, selecting, parsing, ordering, ranking, categorizing), specify the exact format (JSON / XML / list) and the schema or fields. JSON output returns a consistent style, limits hallucination, keeps data typed, relationship-aware, and sortable. Add output indicators (`Sentiment:`) to signal where the answer begins. Caveats: JSON costs more tokens and truncation produces invalid JSON — a repair library (e.g. `json-repair`) belongs in the integration, not the prompt.
- **Structured input (schemas).** JSON Schemas work for *input* too: providing the schema plus conforming data gives the model a blueprint of the fields and their relationships (and dated fields make it time-aware) — valuable for large data volumes and app integrations.
- **Variables.** In app-integrated prompts, use placeholders (`{city}`, `{{EMAIL}}`) instead of hardcoding values, so one template serves every input.
- **Role prompting.** State the assistant's identity, intent, and tone in the instruction, e.g. *"The following is a conversation with an AI research assistant. The assistant tone is technical and scientific."* Even one sentence focuses behavior; see §1 for how it layers with system/contextual prompts.
- **Long-context ordering.** For long-document prompts (~20k+ tokens), invert the §2 rule: put the longform documents at the **top** (each wrapped in `<document>` tags with content/source metadata) and the query + instructions at the **end** — up to ~30% better on multi-document tasks. Ask the model to **quote the relevant passages first**, then answer from the quotes: it grounds the response and cuts hallucination.

---

## 6. Advanced techniques & systems

| Concept | What it is | Key prompt-design points |
| :-- | :-- | :-- |
| **Step-back prompting** | Ask a broader, more abstract question first, then feed that answer into the specific task. | Activates relevant background knowledge before the specific problem; improves accuracy and mitigates bias by anchoring on general principles. Use for reasoning-heavy or context-deep tasks. |
| **Tree of Thoughts (ToT)** | Generalizes CoT: the model explores and evaluates multiple branching reasoning paths instead of one linear chain. | For complex, exploration-heavy problems that need planning and backtracking. An orchestration-level pattern, like self-consistency. |
| **Prompt chaining** | Split a task into subtasks; feed each prompt's output into the next. | Use distinct prompts per step (e.g. prompt 1 extracts relevant quotes; prompt 2 answers using them). Improves reliability, controllability, debuggability, and personalization. |
| **ReAct agents** | Interleave reasoning traces (Thought) with actions (Action) and tool results (Observation) so the model can plan, call tools, observe, and adjust. | Provide few-shot exemplars of Thought → Action → Observation trajectories. Describe available tools clearly and instruct the model to combine internal reasoning with external observations. **Not for Claude 5 targets:** written-out `Thought:` traces are the model reproducing its reasoning as response text, which trips the `reasoning_extraction` refusal category on Fable 5 / Mythos 5. Use native tool calling and read the provider's structured thinking output instead. |
| **RAG** | Combine a retrieval component with the generator: fetch relevant documents and feed them as context. | Concatenate retrieved docs into the prompt as context; explicitly instruct the model to answer *from* that context. Reduces hallucination and adds up-to-date/proprietary knowledge without retraining. "Agentic RAG" lets an LLM/agent decide what to retrieve and route complex queries. |
| **Automatic Prompt Engineering (APE)** | Prompt a model to generate many candidate prompts, score them (e.g. BLEU/ROUGE or task evals), keep and refine the best. | Use when manual optimization is too labor-intensive, or to systematically harvest input phrasings (e.g. every way a customer might word an order). |

Code tasks (explain, translate between languages, debug/review) work well as dedicated prompts: include the code and the traceback verbatim, use a low temperature, and ask for structured findings.

---

## 7. Reasoning models vs. standard chat models

Prompt them differently:

Reasoning is the default now, not the exception: assume a reasoning model unless the target is
explicitly an older or deliberately non-reasoning one.

| Aspect | Reasoning models (Claude 5 family, GPT-5.x, Gemini 3, o-series, …) | Standard chat models (older/non-reasoning tiers) |
| :-- | :-- | :-- |
| **Chain-of-thought** | **Avoid manual CoT**: telling them to "think step by step" can *hurt* instruction-following; they reason internally. | Benefit from manual CoT ("Let's think step by step") on hard tasks. |
| **Instruction style** | Simple, direct, explicit; state response constraints; remove ambiguity. | Benefit from descriptive prompts, examples, and explicit logic frameworks. |
| **Reasoning effort** | Have native internal "thinking" (test-time compute); some expose low/medium/high effort. Start in standard mode, escalate only if needed. | Emit tokens immediately; no hidden planning. |
| **Reasoning visibility** | Never ask them to echo, transcribe, or explain their internal reasoning as response text. On Claude Fable 5 / Mythos 5 that is refused outright (`reasoning_extraction`) and falls back to a weaker model. Ask for a conclusion-level rationale, or read the provider's structured thinking output. | Safe to ask for worked steps inline in the answer. |
| **Failure mode** | Over-/under-think when tasks or output formats aren't strictly specified. | Shallow/hallucinated answers on complex arithmetic/symbolic tasks without step-by-step guidance. |

Two current-generation integration rules: last-turn **prefilled assistant messages are no longer supported** (Claude 4.6+ return an error) — steer format with instructions and examples instead; and some current models **reject decoding parameters** (temperature/top_p/top_k), so tone and variety belong in the prompt.

---

## 8. Context engineering (system prompts for capable models)

The current generation shifted system-prompt writing from prescriptive rule piles to context engineering:

- **Judgment over rule piles.** Accumulated negative rules ("DO NOT add comments") conflict with each other and with user requests. Delete most of them and state the principle instead: *"Write code that matches the comment density, naming, and idiom of the surrounding code."* Capable models handle the judgment.
- **Design tool interfaces, not tool examples.** Usage examples constrain the model to a narrow exploration space. Invest in the tool's schema instead: expressive parameters, self-explanatory enums (`pending | in_progress | completed`), clear non-redundant descriptions.
- **Progressive disclosure.** Don't front-load every guideline into one monolithic prompt. Move situation-specific instructions into modular skills/files/deferred tools that load only when relevant.
- **Keep standing docs lightweight.** Project memory files should carry the *gotchas* — the things the model can't discover by looking — not restate what's obvious from the filesystem.
- **Code-based references beat prose.** An HTML mockup steers a design task better than a description or screenshot; specs-as-code are high-fidelity instructions.
- **Autonomy boundaries.** Tell agents to act autonomously on local, reversible steps (edit, test) but confirm before destructive or hard-to-reverse ones (deleting files, force-pushes, posting externally) — and never to use a destructive action as a shortcut around an obstacle.

---

## 9. Engineering habits

- **Document every prompt attempt** in full: name + version, goal, model + version, config (temperature, token limit, top-K/top-P), the full prompt, the output(s), a result field (OK / NOT OK / SOMETIMES OK), and feedback. Outputs differ across models, settings, versions — even identical calls. For RAG systems, also log the query, chunk settings, and retrieved chunks.
- **Keep prompts out of code.** In production, store prompts in separate files from application code so they're maintainable independently, and put them under automated tests/evals to measure generalization.
- **Adapt to model updates.** New versions change behavior; re-run your documented prompts against new models and adjust to exploit new capabilities.

---

## 10. Risks & mitigations

- **Prompt injection.** Untrusted input overrides your instructions. Mitigate: separate/parameterize instructions from inputs, wrap inputs in delimiters (JSON encoding, Markdown headings, quoting/escaping), warn the model about attacks, use an LLM as an adversarial-prompt detector, or prefer fine-tuned / k-shot non-instruct models. All approaches are partial, so layer them.
- **Prompt leaking.** A form of injection that extracts your confidential prompt/IP. Test robustly if the prompt contains proprietary instructions.
- **Jailbreaking.** Bypassing safety guardrails via personas ("DAN"/"Do Anything Now"), simulators, or role-play. Provider guardrails help but aren't perfect.
- **Factuality / hallucination.** Models produce coherent but fabricated text. Reduce it: provide ground-truth context (article/Wikipedia/retrieved docs); lower temperature/top_p for determinism; **explicitly permit "I don't know"** when the answer isn't in context; ask for supporting quotes first on long documents (§5); and give few-shot examples of both answerable and unanswerable questions.

---

## 11. Quick build checklist

1. **Role/identity + tone** set (if the target is an assistant/persona).
2. **Instruction at the top**, clear verb, specific about format/length/style/audience — *unless* it's a long-document prompt: then documents at the top, query + instructions at the end (§5).
3. **Context** supplied (background, retrieved docs, date) when the task needs knowledge — with the *why* behind non-obvious instructions.
4. **Input delimited** with `###` / `"""` / XML tags.
5. **Output format** defined exactly (schema/fields/indicator): instructions over constraints; prompt style mirrors the desired output.
6. **Few-shot examples** (3 to 5, diverse, edge cases included, classes mixed) in `<example>` tags if pattern/format/tone-sensitive.
7. **CoT** only for reasoning-heavy *non-reasoning-model* targets — answer after the reasoning, temperature 0; keep reasoning-model prompts direct.
8. **"I don't know" permission** + grounding/quotes for factual tasks.
9. **Concise.** Every line earns its place; decompose only genuinely complex tasks.
