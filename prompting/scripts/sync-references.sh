#! /usr/bin/env bash

# Sync-references: download the vendor pages the prompting skill mirrors and report which ones
# changed upstream.

# The three general pages are saved as <vendor>-general.md, never as a bare vendor name: on a
# case-insensitive filesystem claude.md is CLAUDE.md and gemini.md is GEMINI.md, which coding agents
# load as standing instructions.

# Every mirrored file is a byte-for-byte copy of its page, or an unedited section of one, so this
# script never rewrites text: it replaces a file whole or leaves it alone. Two files under
# references/ are written by hand and are not touched here: SOURCES.md and gemini-4.md (its source
# page is rendered by script and has no downloadable form).

# Usage: sync-references.sh [--check]. With --check nothing is written, and the exit status is 1
# when an upstream page differs from the local copy.

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dest="$here/../skills/prompting/references"
anthropic="https://platform.claude.com/docs/en/build-with-claude/prompt-engineering"
google="https://aistudio.google.com/docs"
openai="https://developers.openai.com/api/docs/guides"
cookbook="https://raw.githubusercontent.com/anthropics/claude-cookbooks/main"

check=0
[ "${1:-}" = "--check" ] && check=1

# Local file name, then the URL it copies.
mirrors=(
	"claude-general.md $anthropic/claude-prompting-best-practices.md"
	"claude-fable.md $anthropic/prompting-claude-fable-5-2.md"
	"claude-opus.md $anthropic/prompting-claude-opus-5-5.md"
	"claude-sonnet.md $anthropic/prompting-claude-sonnet-5-5.md"
	"claude-haiku.md $anthropic/prompting-claude-haiku-5-5.md"
	"claude-opus-4.8.md $anthropic/prompting-claude-opus-4-8.md"
	"claude-context-engineering.md https://claude.dev/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models.md"
	"claude-metaprompt.ipynb $cookbook/misc/metaprompt.ipynb"
	"claude-metaprompt.LICENSE $cookbook/LICENSE"
	"gpt-general.md $openai/prompt-engineering.md?api-mode=responses"
	"gpt-6.md $openai/latest-model/gpt-6-astra.md"
	"gpt-6.2.md $openai/latest-model/gpt-6.2-astra.md"
)

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/out"

for entry in "${mirrors[@]}"; do
	curl -fsSL --max-time 60 -o "$tmp/out/${entry%% *}" "${entry#* }"
done

# Google publishes one prompting page for every Gemini model. Its "## Gemini 3" section becomes
# gemini-3.md and the rest of the page, in order, becomes gemini-general.md.
curl -fsSL --max-time 60 -o "$tmp/gemini-page.md" "$google/prompting-strategies.md"
awk -v three="$tmp/out/gemini-3.md" -v rest="$tmp/out/gemini-general.md" '
	/^## / { in3 = ($0 ~ /^## Gemini 3( |$)/) }
	{ print > (in3 ? three : rest) }
' "$tmp/gemini-page.md"
if [ ! -s "$tmp/out/gemini-3.md" ] || [ ! -s "$tmp/out/gemini-general.md" ]; then
	echo "sync-references: the Gemini page no longer has a '## Gemini 3' section to split on" >&2
	exit 2
fi

changed=0
for file in "$tmp/out"/*; do
	name="$(basename "$file")"
	if [ -f "$dest/$name" ] && cmp -s "$file" "$dest/$name"; then
		echo "unchanged  $name"
		continue
	fi
	changed=1
	if [ "$check" -eq 1 ]; then
		echo "differs    $name"
	else
		mkdir -p "$dest"
		mv "$file" "$dest/$name"
		echo "updated    $name"
	fi
done

[ "$check" -eq 1 ] && exit "$changed"
exit 0
