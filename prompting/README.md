# prompting

A prompt engineer for [Claude Code](https://github.com/anthropics/claude-code) that knows the
model it is writing for. Name a Claude, Gemini or GPT model and describe what you want it to do,
or paste a prompt that is misbehaving, and the skill returns one prompt tuned to that model's
documented behaviour. It works from a local mirror of each vendor's own prompting guides, so it
needs no network. It replaces the `prompting-claude` and `prompt-engineering` plugins.

```
You: "our Opus 5.5 agent stops after two endpoints, fix the prompt"   (no command)
        │  skill `prompting` engages and:
        ▼
   1. Target    ── vendor and model, what kind of prompt, how it runs
   2. Read      ── that model's guide in full, then the vendor's general guide as needed
   3. Draft     ── the task, the reason behind each instruction, structure, kept small
   4. Add       ── the guide's patterns for the behaviour you reported
   5. Remove    ── what was written for an older model
   6. Separate  ── fixes that are request settings, not prompt text
   7. Output    ── the finished prompt in one fenced block, settings notes after it
```

## Auto-Engagement

The entry point is an auto-invoked skill named `prompting`. Claude loads it when you ask for a
prompt built or fixed for a Claude, Gemini or GPT model, a Gemini Gem, a custom GPT or a Claude
Project, or describe a behaviour to change: "write a system prompt for Opus 5.5", "Gemini 3 keeps
answering in one line", "GPT-6 asks for approval at every step", "move this prompt to Sonnet
5.5". Type `/prompting` to force it.

## Install

```sh
/plugin marketplace add lzlrd/marketplace
/plugin install prompting@lzlrd
```

If you have the two plugins it replaces, remove them:

```sh
/plugin uninstall prompting-claude@lzlrd
/plugin uninstall prompt-engineering@lzlrd
```

## What You Get Back

The finished prompt, in one fenced code block that pastes cleanly.

On current models a documented fix is often a request setting rather than prompt text: the
reasoning effort, the thinking configuration, sampling parameters to remove, a tool to enable.
When that is the case the skill says so in a short "Outside the prompt" list after the block,
instead of writing prompt text for something prompting does not change. The same list names any
instruction of yours it removed, and any placeholder you need to fill. It asks one question first
when the target model is missing, and explains its changes only when you ask.

For a general-purpose assistant (a Gem, a custom GPT, a Project) it folds in four defaults unless
you say otherwise: accuracy over agreeableness, the core answer first, comparisons as tables, and
long answers delivered in segments.

## How It Decides

Most of the work is diagnosis. The model guides are organised by observed behaviour (stops
early, goes quiet on long turns, delegates too much, drifts from its instructions, returns
refusals), so the skill matches what you report to a section, adds the few lines that section
calls for, and removes instructions written for an older model.

It applies the vendors' own rule for reading their guidance: a technique that names a model was
measured on that model. Guidance for Fable 5.1 is not applied to Fable 5.2 because the names are
close, and a Claude pattern is not evidence about Gemini or GPT.

## Knowledge Base

`references/` holds one general guide per vendor and one file per model family.

| File | Covers |
| --- | --- |
| `claude-general.md` | Anthropic's prompting best practices, for all current Claude models |
| `claude-fable.md` | Claude Fable 5.2 and Mythos 5.2 |
| `claude-opus.md` | Claude Opus 5.5 |
| `claude-sonnet.md` | Claude Sonnet 5.5 |
| `claude-haiku.md` | Claude Haiku 5.5 |
| `claude-opus-4.8.md` | Claude Opus 4.8 |
| `claude-context-engineering.md` | Anthropic's post on context engineering for the Claude 5 generation |
| `claude-metaprompt.ipynb` | Anthropic's metaprompt notebook, the method for prompt templates |
| `gemini-general.md` | Google's prompt design strategies, for all Gemini models |
| `gemini-3.md` | The Gemini 3 section of the same page |
| `gemini-4.md` | The five practical tips from the Gemini 4 Carbon developer guide |
| `gpt-general.md` | OpenAI's prompt engineering guide |
| `gpt-6.md` | OpenAI's guide for the GPT-6 family |
| `gpt-6.2.md` | OpenAI's guide for GPT-6.2 |

Every file is an unedited copy of its page, or an unedited section of one, with one exception:
Google's Gemini 4 guide has no downloadable form, so `gemini-4.md` is a summary. A model file is
named for its family and holds the current version's page. `references/SOURCES.md` records each
URL and the fetch date.

The pages belong to Anthropic, Google and OpenAI and are not covered by this repository's
licence. The notebook is MIT, with its notice kept beside it.

The general guides are named `<vendor>-general.md` on purpose. On macOS and Windows `claude.md`
is `CLAUDE.md`, which Claude Code loads as standing instructions, and `gemini.md` is the file
Gemini CLI loads the same way.

To refresh the mirror:

```sh
prompting/scripts/sync-references.sh          # download again, report what changed
prompting/scripts/sync-references.sh --check  # write nothing, exit 1 if a page moved on
```

After a refresh, reread the changed files and update what `SKILL.md` restates from them.

## Structure

```
prompting/
├── .claude-plugin/
│   └── plugin.json                 # manifest
├── scripts/
│   └── sync-references.sh          # refresh the mirror
└── skills/prompting/
    ├── SKILL.md                    # references map, procedure, vendor notes, output (loaded when the skill triggers)
    └── references/                 # loaded on demand
        ├── SOURCES.md                  # provenance and rights
        ├── claude-general.md
        ├── claude-fable.md
        ├── claude-opus.md
        ├── claude-sonnet.md
        ├── claude-haiku.md
        ├── claude-opus-4.8.md
        ├── claude-context-engineering.md
        ├── claude-metaprompt.ipynb
        ├── claude-metaprompt.LICENSE
        ├── gemini-general.md
        ├── gemini-3.md
        ├── gemini-4.md
        ├── gpt-general.md
        ├── gpt-6.md
        └── gpt-6.2.md
```
