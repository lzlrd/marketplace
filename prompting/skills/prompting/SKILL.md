---
name: prompting
description: >-
  Write, optimize, or migrate a prompt, system prompt, agent definition, or
  prompt template for a model from Anthropic, Google, or OpenAI, tuned to that
  model's documented behavior: Claude (Fable 5.2, Mythos 5.2, Opus 5.5, Sonnet
  5.5, Haiku 5.5, Opus 4.8), Gemini (3 and 4 Carbon), and GPT (6 and 6.2). Use
  when the user wants a prompt written or fixed, whether or not a model is
  named, including for a Gemini Gem, a custom GPT, or a Claude Project; reports
  that a model or agent they are prompting misbehaves (stops before the work is
  done, goes quiet on long turns, over-delegates, asks for approvals it does
  not need, drifts from its instructions, returns refusals, produces JSON that
  does not parse, thinks for too long); is moving a prompt from one model to
  another; or types /prompting. Not for complaints about the current session's
  own behavior. Grounded in offline copies of each vendor's prompting guides.
  Returns the finished prompt, plus the request settings to change when the
  documented fix is not prompt text.
---

# Prompting

Produce one prompt tuned to a named model, or repair one the user pastes in. The knowledge base is a set of copies of the vendors' own prompting guides under `references/`, so the skill works offline and the guides' sample prompts are on hand in their published wording. The one exception is `gemini-4.md`, a summary whose source page and sample prompts are online only.

Most of the work is diagnosis. Each model's guide names a few behaviors that need prompt text and several that are controlled by request settings. Find what the target does differently, add the few lines that address it, remove what was written for an older model, and say plainly when the fix is a setting rather than words.

## References

Start with the file for the model in use, then open the sections of the vendor's general guide that the task touches.

| Vendor | General guide | Model files |
|---|---|---|
| Claude | `references/claude-general.md` | `claude-fable.md` (Fable 5.2, Mythos 5.2), `claude-opus.md` (Opus 5.5), `claude-sonnet.md` (Sonnet 5.5), `claude-haiku.md` (Haiku 5.5), `claude-opus-4.8.md` |
| Gemini | `references/gemini-general.md` | `gemini-3.md`, `gemini-4.md` (Gemini 4 Carbon) |
| GPT | `references/gpt-general.md` | `gpt-6.md` (GPT-6 and 6.1), `gpt-6.2.md` |

Two more Claude files: `claude-context-engineering.md`, on shaping system prompts, skills, and other reusable layers, and `claude-metaprompt.ipynb`, the source of the method under "Prompt Templates". `references/SOURCES.md` lists where each file came from and which model version it describes. The vendor notes further down are a digest as of the fetch date recorded there; where a refreshed file disagrees with a note, the file is right.

## Procedure

1. **Fix the target and the surface.** Establish the vendor and model, what kind of prompt it is (system prompt, single user prompt, reusable template, agent or subagent definition, skill, tool description), and how it runs (with tools, unattended or with a person watching, in a chat product, at what reasoning effort if known). If the model is not named and nothing in the conversation settles it, ask, because the answer changes the prompt. Default the rest, except facts about the user's product that the prompt would state as true (an escalation route, a reply language, a file path): leave a marked placeholder for those.
2. **Read the model's file in full, then the parts of the general guide the task touches.** The model files are short and are the authority for their model. The Claude files open with a list of observed behaviors mapped to sections, and the GPT files carry one under "Prompting best practices"; match what the user describes against it. The Gemini files have no such list, so read them whole. The general guides are long: list a guide's sections by searching it for lines that begin with `##`, and open only the ones the task touches. For a reusable Claude layer (system prompt, CLAUDE.md, skill, agent definition, tool description), also read `claude-context-engineering.md`.
3. **Draft small.** State the task and what a good result looks like. On Claude, give the reason behind any instruction that is not obvious, because Anthropic's guide says the model generalizes from it; on other vendors keep to what their guide asks for. Separate instructions from material with the delimiters the vendor's guide uses, and put long documents where that guide says to put them. Use examples to pin a format or a tone, as far as the vendor's guide leans on them. An example that needs the user's own material (their policy, their data) is left as a marked placeholder, never invented, and an example reply is written exactly as the model should return it.
4. **Add what the model's file calls for, where the situation matches.** A pattern earns its place when the user reports the behavior it addresses, or when the surface plainly has the situation (an unattended agent, a chat product, a search tool, a JSON contract). Follow the guide's own condition: some samples are for a surface, others only once the behavior has been seen. Treat a sample as a starting point to adapt to the product unless the guide says to use it as written, and copy exactly what a guide says to copy exactly; when the session cannot reproduce a sample or block word for word, name its file and heading so the user can paste it. When a vendor's clause conflicts with the task, edit the clause at the sentence that conflicts.
5. **Remove what was written for an older model.** Apply the removals the model's file lists and the vendor notes below. Delete an instruction whose reason no longer holds. Rewrite an absolute rule worth keeping so that it carries its scope and its reason, taking both from the user or the guide rather than inventing policy. When the user reports problems with a prompt they have not shown, write a full replacement and say that it replaces the old one.
6. **Keep prompt and settings apart.** A behavior a guide puts under a request setting or the harness goes in the notes after the prompt (see Output). Write prompt text for it only where the guide pairs the setting with text, as it often does: a checklist the harness reads, a tool the prompt tells the model to use.
7. **Deliver** as described under Output.

## Reading the References

The mirrored files are unedited, so they also mention models this skill has no file for, and the general guides are organized by technique rather than by model. Anthropic's general guide says a technique that names a model was measured on that model. OpenAI's model pages say their prompts address behavior observed on one named model and should be evaluated on the model in use. So use a technique for the target when the text names the target, or when it names no model and so speaks of all current ones. A pattern attributed to another model is not a default for the target, however close the name (Fable 5.1 is not Fable 5.2; GPT-6 is not GPT-6.2). Reach for one only when the user reports that same behavior on the target, and present it as untested there.

Two cautions follow from that. A section a general guide heads for its latest model, such as the GPT guide's "Prompting current models", is addressed to that model and partly carried forward from earlier ones, so prefer the model's own file. And where a model's file says its predecessor's prompts carry over, as the Opus and Sonnet files do, an existing prompt for the predecessor is a sound starting point; the predecessor's guide is not among these references, so say so when a question turns on it.

Let the model's file decide where it and the general guide differ. Guidance does not cross vendors: a Claude pattern is not evidence about Gemini or GPT. In notes, attribute to a guide only what it states, and mark an inference as one.

For an older version or a smaller sibling of a covered family, use the vendor's general guide alone and tell the user the prompt is not tuned to that model. For a vendor with no guide here, say so and draft from the procedure alone.

## Claude

| Model | File | Effort to start from | Thinking | Asking for reasoning in the reply |
|---|---|---|---|---|
| Fable 5.2 | `claude-fable.md` | `high`, the API default | Always on, adaptive only; at `high` and above it thinks before almost every reply | Can be declined (`reasoning_extraction`) |
| Opus 5.5 | `claude-opus.md` | `medium`, the default | Always on; `disabled` returns a 400 | Can be declined |
| Sonnet 5.5 | `claude-sonnet.md` | `high`, the API default; `medium` for well-specified agentic work; `medium` or `low` for chat | On by default; `between_tools` is the lowest setting, at `high` effort or below | Can be declined |
| Haiku 5.5 | `claude-haiku.md` | `medium`, the default | On by default; can be turned off at `low`, `medium`, and `high` | Not among the refusal categories its guide lists, but reasoning-like text can show up in replies with thinking off or at `low` effort |
| Opus 4.8 | `claude-opus-4.8.md` | `xhigh` for coding and agentic work; at least `high` when intelligence matters | Off unless `thinking: {type: "adaptive"}` is set | Allowed; with thinking off, asking it to reason before answering is the documented fallback |

Mythos 5.2 uses the Fable file, which covers both.

`claude-context-engineering.md` was written about the Claude 5 generation; it names Opus 5 and Fable 5 and reports results from Claude Code. Applying it to the four 5.x models here is this skill's choice, and it is for reusable layers, not one-off prompts: describe the judgment the model should apply rather than rules that are only sometimes true, let expressive tool parameters teach usage rather than piles of examples, load detail on demand, keep a tool's instructions in its own description, and remove or simplify constraints that collide across layers. Let a model's file win where it asks for explicit text. The post does not describe Opus 4.8, whose file says it follows instructions literally and does not generalize from one item to the next, so state the scope of an instruction outright for that model.

Remove on sight, on the models noted:

- **Instructions to write reasoning into the response:** a pre-answer thinking, reasoning, or scratchpad section; a `reasoning`, `thinking`, or `trace` key in JSON or a tool input; the model's private notes or a running log of its reasoning; a demand for its full chain of thought. These can be declined on Fable 5.2, Opus 5.5, and Sonnet 5.5, and the instruction can sit in any layer, so check the system prompt, skills, and tool descriptions. A brief explanation, the evidence behind a result, or a recap of what the model did is still fine to ask for (the refusals page listed in `SOURCES.md` draws this line). Asking the model to think before it answers is a different thing, and the Sonnet file uses it as a fix for JSON reasoning tasks.
- **Rules that tell the model not to think,** on the four 5.x models. Each file says prompt text does not reliably reduce thinking and points to the effort level as the main control; Sonnet and Haiku also have the thinking settings in the table. On Sonnet 5.5 with `between_tools` such rules make internal tags more likely to appear in visible output. The Opus file keeps one such line as a measured last resort after lowering effort.
- **A prefilled final assistant turn** and **`thinking.budget_tokens`.** All five models return a 400 for either.

Two blocks in `claude-general.md` are copied word for word when their conditions hold. The payments and financial-records block is for an agent that handles payments, account numbers, or figures other people rely on; the guide names two sentences to leave out when the agent is meant to send payments. The medication-dosing block comes in a variant per model (none is labelled for Mythos 5.2, so say which one was used). When it is unclear whether a block applies, raise it in a note instead of adding it.

Request-parameter changes between versions (Sonnet 5.5 rejecting sampling parameters, for example) are in each model's migration guide, which its file links and these references do not hold. Fetch it when a prompt is moving between versions.

## Gemini

- **Gemini 3** wants prompts that are direct and plainly structured, without persuasive padding: one delimiter style per prompt (XML-style tags or Markdown headings), ambiguous terms defined, and the essentials (constraints, persona, output format) in the system instruction or at the very top. With a large context, the material goes first and the question last, bridged by a phrase that points back at it. It answers tersely by default, so ask for a longer or more conversational reply when one is wanted. Thinking is automatic, so reasoning steps in the reply are usually unnecessary; a short line asking it to think hard can help on heavy problems, at the cost of thinking tokens. `gemini-3.md` also carries three ready clauses for Gemini 3 Flash (current date, knowledge cutoff, strict grounding), which hold a literal year and cutoff date to update, and a full template.
- **Examples:** Google's general guide recommends few-shot examples as a rule, formatted identically, and warns that too many can overfit.
- **Agents:** `gemini-general.md` lists the behaviors worth configuring in an agent prompt (how deeply to analyze, how persistent to be, read risk against write risk, when to ask) and a system instruction template evaluated on benchmarks where the agent follows a rulebook and talks to a user. Adapt its ask-the-user items for an unattended agent.
- **Gemini 4:** `gemini-4.md` summarizes Google's tips for Gemini 4 Carbon, which are about how a task is set up more than how a prompt is worded: agree the goal and success criteria before a long run, give the model something to verify against, hand it concrete visual references, use it to lead a team of faster agents, and have it record what it learned. Google gives no Gemini 4 guidance on delimiters or placement, and the summary does not cover the guide's API sections (thinking level, output limits) or prices; open the live guide for those. For another Gemini 4 model, say the tips were written about Carbon.
- **Settings:** Gemini 4 and Gemini 3.6 and later ignore custom `temperature`, `top_p`, and `top_k`, so remove them; on earlier Gemini 3 models leave them at their defaults. Grounding with Google Search is the fix for recent or obscure facts, code execution for arithmetic, and the API's structured output for a complex JSON schema. Those are features to enable, not prompt text.

## GPT

- **Where the text goes.** Reusable rules belong in a `developer` message at the start of `input`, usually in the order identity, instructions, examples, context, with Markdown headings for sections and XML tags around material. The top-level `instructions` field is for guidance that applies to one request; from GPT-6.2 it is appended after the input, so stable text placed there is not cached. Say where the prompt goes when the user calls it a system prompt.
- **How much to spell out.** OpenAI's general guide contrasts reasoning models, which do well given a goal to work out, with GPT models, which benefit from precise, explicit instructions, and it counts `gpt-6.2-astra` among the latter even though it reasons. So supply the logic and data the task needs. Extending that to the GPT-6 page's models is an inference.
- **GPT-6 family** (`gpt-6.md`, measured on GPT-6 Astra): it asks for clarification more readily than its predecessors, is more sensitive to instructions in skills and `AGENTS.md` (audit them, and state that the user's instructions outrank a skill's), tends toward formatted and detailed replies, delegates less than some harnesses want, and tests more broadly than a small change needs. The file has a starting prompt for each.
- **GPT-6.2** (`gpt-6.2.md`, Astra and Sol): more concise and direct by default, so revisit inherited "be concise" lines. It may propose a next step and wait when intent is unclear. The file's prompts cover writing for a reader who has not followed the work, carrying a task through, coding conventions, and frontend look.
- **Settings:** on the GPT-6 page's models keep the reasoning effort already in use where it is supported (GPT-6 Astra and GPT-6.1 Sol have no `none`; use `low`). On GPT-6.2 start a new integration at `medium` and change a request that used `none` or `minimal` to `low`. Remove `temperature`, `top_p`, and the log-probability parameters: on the GPT-6 page's models whenever effort is not `none`, on GPT-6.2 always. Reasoning with tools needs the Responses API. From GPT-6.2, leave earlier developer messages and tool calls unchanged within a conversation, because editing them drops the model's reasoning items. Structured Outputs is the documented fix for JSON that does not parse.

## Prompt Templates

For a reusable single-turn template with input variables, use the method below. It comes from `claude-metaprompt.ipynb`, which is written for Claude; applying it to other vendors is this skill's extension. Open the notebook only for its worked examples.

- Choose the smallest set of non-overlapping input variables; some tasks need one, and more than two or three is rare.
- Plan the structure before writing: decide where each variable goes, and place any variable that will hold a long value where the vendor's guide puts long material.
- Substitute each variable once, inside tags that mark where it starts and ends, and refer to it by name after that. The notebook writes placeholders as `{$NAME}`; use the user's templating syntax when they have one.
- Name the tags the output should use, without writing empty tag pairs into the template.
- Steer how the response begins with a closing instruction rather than a prefilled turn.
- Write instructions for the task, not an answer to it.
- Test with example values on the model the template is written for when sample inputs are at hand. Check the stop reason: a run that ends at the token limit needs a higher limit and a rerun before the template is judged. When no test was run, say so in a note.

The notebook's examples and closing notes prescribe a scratchpad or inner-monologue section before the answer, and a justification placed before a score. Leave both out for Fable 5.2, Opus 5.5, and Sonnet 5.5, where they can be declined. For Gemini and GPT they are unnecessary rather than forbidden. For Opus 4.8 or Haiku 5.5 with thinking off, reasoning before the answer is still the documented fallback. When the user needs the basis for a result, ask for the evidence or a short explanation. Use the vendor's tool calling in place of the notebook's hand-written function-call tags.

## General-Purpose Assistants

When the prompt is for a general assistant, analyst, or researcher (a Gem, a custom GPT, a Project) rather than a narrow task, fold these in, reworded to fit the prompt's voice, unless the user says to leave them out. They are this skill's house defaults, not vendor guidance, and the model's file wins where one conflicts with it:

- Accuracy over agreeableness: no flattery, and say so or ask when unsure rather than guess.
- Lead with the core answer.
- Comparisons of two or more items as a Markdown table.
- A long answer delivered in segments, stopping at a natural break and telling the user to reply "continue", rather than cut down to fit.

A narrow extraction, classification, or formatting prompt takes only the first, and only where it fits the output contract. For a personal assistant, standing facts about its owner that change its answers belong in the prompt as marked placeholders for the user to fill.

## Output

Give the finished prompt in a single fenced code block, with nothing before it. Use a four-backtick fence when the prompt itself contains fenced blocks.

Three things may follow or replace it:

- **A clarifying question,** alone, when the target model or another fact that changes the prompt is missing and cannot be defaulted.
- **Notes headed "Outside the prompt",** after the fence. Keep them to what the user has to act on: one sentence each (the change, then its reason in a clause), six at most, the ones the prompt cannot run without first. Merge related points into one note, and leave out what the prompt already makes plain. A note that removes a setting the user chose for a purpose says what the guide offers for that purpose instead. Only these kinds qualify:
  - a request setting or harness change the guide gives for what the user described, or that the prompt just written depends on: the reasoning effort or thinking level, the thinking configuration, sampling parameters to remove, how progress updates are displayed, the output token limit, structured outputs and how the response is parsed, where mid-turn user messages are placed, which tools to enable, where the prompt is placed in the request, or that a changed system prompt belongs in new conversations (the four Claude 5.x models, and GPT from 6.2);
  - a cost or side effect the guide states for a pattern that was added, and what to measure after the change;
  - an instruction of the user's that was removed or reversed, with the guide's reason;
  - a placeholder to fill or a default the prompt assumes that the user should confirm.

  For a Claude Code agent definition the settings are its `model` and `effort` frontmatter fields. For a Gem, a custom GPT, or a Project the user cannot change request settings, so leave those items out.
- **An explanation,** after the notes, when the user asks what changed or why.
