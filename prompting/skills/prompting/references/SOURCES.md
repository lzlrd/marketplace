# Sources

Every file in this directory except this one and `gemini-4.md` is an unedited copy of the page named below, an unedited section of it, or the page with one named section taken out, fetched on 2026-11-19. Nothing in them has been reworded, trimmed, or reordered.

| File | Describes | Source |
|---|---|---|
| `claude-general.md` | All current Claude models | <https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices> |
| `claude-fable.md` | Claude Fable 5.2 and Mythos 5.2 | <https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-2> |
| `claude-opus.md` | Claude Opus 5.5 | <https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5> |
| `claude-sonnet.md` | Claude Sonnet 5.5 | <https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5-5> |
| `claude-haiku.md` | Claude Haiku 5.5 | <https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-haiku-5-5> |
| `claude-opus-4.8.md` | Claude Opus 4.8 | <https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8> |
| `claude-context-engineering.md` | The Claude 5 generation | <https://claude.dev/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models/> |
| `claude-metaprompt.ipynb` | Prompt templates (Anthropic's metaprompt) | <https://github.com/anthropics/claude-cookbooks/blob/main/misc/metaprompt.ipynb> |
| `claude-metaprompt.LICENSE` | The notebook's MIT notice | <https://github.com/anthropics/claude-cookbooks/blob/main/LICENSE> |
| `gemini-general.md` | All Gemini models | <https://aistudio.google.com/docs/prompting-strategies>, without its "Gemini 3" section |
| `gemini-3.md` | Gemini 3 | The "Gemini 3" section of the same page |
| `gemini-4.md` | Gemini 4 Carbon | <https://aistudio.google.com/learn/gemini-4-carbon-developer-guide>, section "5 practical tips for building with Gemini 4 Carbon" (a summary, see below) |
| `gpt-general.md` | OpenAI models in general | <https://developers.openai.com/api/docs/guides/prompt-engineering?api-mode=responses> |
| `gpt-6.md` | GPT-6 Astra, GPT-6.1 Sol and Terra, GPT-6 Luna | <https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra> |
| `gpt-6.2.md` | GPT-6.2 Astra and Sol | <https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6.2-astra> |

All three documentation sites serve a markdown form of a page at its URL with `.md` appended. For the two OpenAI model guides that form is at `latest-model/gpt-6-astra.md` and `latest-model/gpt-6.2-astra.md`.

A Claude or GPT model file is named for its family and holds the page for that family's current version; when the vendor ships a successor the file is replaced and this table updated, and the model references in `SKILL.md` (the References table, the Claude table, and the Gemini and GPT notes) need the same check. Three files are exceptions: `claude-opus-4.8.md` is named for its version and kept as the previous Opus generation, `gemini-3.md` is a section of Google's single prompting page, and `gemini-4.md` is a summary.

## Why the General Files Are Not Named for the Vendor Alone

On a case-insensitive filesystem `claude.md` is `CLAUDE.md` and `gemini.md` is `GEMINI.md`, which Claude Code and Gemini CLI load as standing instructions whenever they work in the directory. The general guides are therefore `<vendor>-general.md`.

## The One Summary

Google's Gemini 4 Carbon guide is rendered by script and has no downloadable form, so `gemini-4.md` is a summary written for the skill, covering only the section named above. Open the page when exact wording matters.

## Rights

The documentation pages and the blog post belong to Anthropic, Google, and OpenAI, and are reproduced here unedited for offline reference; they are not covered by this repository's license. The metaprompt notebook comes from `anthropics/claude-cookbooks` under the MIT License, whose notice is kept beside it.

## Cited, Not Mirrored

| Page | Used for |
|---|---|
| <https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback> | What triggers a `reasoning_extraction` decline and what is still fine to ask for; refusal categories and fallback |
| <https://platform.claude.com/docs/en/build-with-claude/effort> | Recommended effort levels per Claude model |
| The migration guide linked from each Claude model file | Request-parameter changes, for example the removal of `temperature`, `top_p`, and `top_k` on Sonnet 5.5 |

## Refreshing

`scripts/sync-references.sh` at the plugin root downloads every mirrored page again, splits the Gemini page, and reports which files changed; with `--check` it writes nothing and exits 1 when a page has moved on. After a refresh, reread the changed files and update what `SKILL.md` restates from them: the Claude table and removals, and the Gemini and GPT notes.
