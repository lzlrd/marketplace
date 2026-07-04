# Prompt Engineering Guide: Distilled Reference

Offline distillation of the NotebookLM notebook *"Promptingguide.ai's Prompt Engineering Guide"* (based on promptingguide.ai / DAIR.AI). This file is the fallback knowledge base for the `prompt-engineering` skill when the NotebookLM MCP is not connected. It contains the guide's core techniques so the skill produces the same quality of prompt offline.

---

## 1. Anatomy of a prompt

A prompt is composed of up to four elements. Include the ones the task needs:

| Element | What it is |
| :-- | :-- |
| **Instruction** | The specific task the model must perform. Use a clear verb (Translate, Classify, Summarize, Extract…). |
| **Context** | External info that steers the model: background, domain data, retrieved documents, current date/time. |
| **Input data** | The specific text/question to act on. |
| **Output indicator** | The desired type/format of the result (e.g. `Sentiment:`, a JSON schema, a heading). |

---

## 2. Core design principles

- **Start simple, then iterate.** Begin with a basic instruction; add context/examples as needed. Decompose genuinely complex tasks into subtasks.
- **Put the instruction at the top.** Models attend most to the beginning and end of the input; lead with the task, put input/examples below. Optionally reinforce with a separator like `###`.
- **Be specific and direct.** Spell out the desired outcome, format, length, style, and audience. "Use 2 to 3 sentences to explain X to a high-school student" beats "explain X briefly." Avoid ambiguity and over-cleverness.
- **Say what to do, not what to avoid.** Positive, actionable instructions outperform prohibitions ("do not…"). Give the model a concrete behavior to follow.
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

**Rules:** adjust temperature **or** top_p (not both); tune frequency **or** presence penalty (not both). For factual QA, lower temperature/top_p. Modern models repeat less, so penalties matter less than they used to.

---

## 4. Core prompting techniques

| Technique | What it is | When to use |
| :-- | :-- | :-- |
| **Zero-shot** | Instruction only, no examples; relies on the model's pretraining + instruction tuning. | Common, foundational tasks (classification, summarization, extraction) the model already understands. Always try this first. |
| **Few-shot** | Include 1 to N input→output demonstrations to enable in-context learning. | When zero-shot fails, when you need an exact format/tone/label, or the task is nuanced. Examples should be representative, well-formatted, and diverse; label space and input distribution matter. |
| **Chain-of-Thought (CoT)** | Elicit intermediate reasoning steps before the answer. **Few-shot CoT:** show worked examples. **Zero-shot CoT:** append "Let's think step by step." | Complex arithmetic, commonsense, or symbolic reasoning where direct answers are wrong. |
| **Self-consistency** | Sample multiple diverse CoT reasoning paths, take the majority/most-consistent answer (replaces greedy decoding). | Hard reasoning tasks where accuracy is critical and one sample is unreliable. |

---

## 5. Structure & formatting

- **Delimiters.** Separate instruction, context, and input with clear markers: `###`, triple quotes `"""`, or XML-style tags (e.g. `<input>…</input>`, `<user_query>…</user_query>`). Prevents confusion and clarifies what to process vs. generate. Also a first-line defense against prompt injection.
- **Structured output.** For analysis/extraction, specify the exact format (JSON / XML / list) and the schema or fields. Add output indicators (`Sentiment:`, `Place:`) to signal where the answer begins. Structuring *inputs* as JSON/XML also helps.
- **Role prompting.** State the assistant's identity, intent, and tone in the instruction, e.g. *"The following is a conversation with an AI research assistant. The assistant tone is technical and scientific."* Effective for setting persona and register (including translation register/formality).

---

## 6. Advanced techniques & systems

| Concept | What it is | Key prompt-design points |
| :-- | :-- | :-- |
| **Prompt chaining** | Split a task into subtasks; feed each prompt's output into the next. | Use distinct prompts per step (e.g. prompt 1 extracts relevant quotes; prompt 2 answers using them). Improves reliability, controllability, debuggability, and personalization. |
| **ReAct agents** | Interleave reasoning traces (Thought) with actions (Action) and tool results (Observation) so the model can plan, call tools, observe, and adjust. | Provide few-shot exemplars of Thought → Action → Observation trajectories. Describe available tools clearly and instruct the model to combine internal reasoning with external observations. |
| **RAG** | Combine a retrieval component with the generator: fetch relevant documents and feed them as context. | Concatenate retrieved docs into the prompt as context; explicitly instruct the model to answer *from* that context. Reduces hallucination and adds up-to-date/proprietary knowledge without retraining. "Agentic RAG" lets an LLM/agent decide what to retrieve and route complex queries. |

---

## 7. Reasoning models vs. standard chat models

Prompt them differently:

| Aspect | Reasoning models (o-series, Gemini 2.5 Pro, Claude 3.7+, …) | Standard chat models (GPT-3.5/4, …) |
| :-- | :-- | :-- |
| **Chain-of-thought** | **Avoid manual CoT**: telling them to "think step by step" can *hurt* instruction-following; they reason internally. | Benefit from manual CoT ("Let's think step by step") on hard tasks. |
| **Instruction style** | Simple, direct, explicit; state response constraints; remove ambiguity. | Benefit from descriptive prompts, examples, and explicit logic frameworks. |
| **Reasoning effort** | Have native internal "thinking" (test-time compute); some expose low/medium/high effort. Start in standard mode, escalate only if needed. | Emit tokens immediately; no hidden planning. |
| **Failure mode** | Over-/under-think when tasks or output formats aren't strictly specified. | Shallow/hallucinated answers on complex arithmetic/symbolic tasks without step-by-step guidance. |

---

## 8. Risks & mitigations

- **Prompt injection.** Untrusted input overrides your instructions. Mitigate: separate/parameterize instructions from inputs, wrap inputs in delimiters (JSON encoding, Markdown headings, quoting/escaping), warn the model about attacks, use an LLM as an adversarial-prompt detector, or prefer fine-tuned / k-shot non-instruct models. All approaches are partial, so layer them.
- **Prompt leaking.** A form of injection that extracts your confidential prompt/IP. Test robustly if the prompt contains proprietary instructions.
- **Jailbreaking.** Bypassing safety guardrails via personas ("DAN"/"Do Anything Now"), simulators, or role-play. Provider guardrails help but aren't perfect.
- **Factuality / hallucination.** Models produce coherent but fabricated text. Reduce it: provide ground-truth context (article/Wikipedia/retrieved docs); lower temperature/top_p for determinism; **explicitly permit "I don't know"** when the answer isn't in context; and give few-shot examples of both answerable and unanswerable questions.

---

## 9. Quick build checklist

1. **Role/identity + tone** set (if the target is an assistant/persona).
2. **Instruction at the top**, clear verb, specific about format/length/style/audience.
3. **Context** supplied (background, retrieved docs, date) when the task needs knowledge.
4. **Input delimited** with `###` / `"""` / XML tags.
5. **Output format** defined exactly (schema/fields/indicator): say what to do, not what to avoid.
6. **Few-shot examples** (1 to 3, representative) if pattern/format/tone-sensitive.
7. **CoT** only for reasoning-heavy *non-reasoning-model* targets; keep reasoning-model prompts direct.
8. **"I don't know" permission** + grounding for factual tasks.
9. **Concise.** Every line earns its place; decompose only genuinely complex tasks.
