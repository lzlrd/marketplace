#! /usr/bin/env python3
"""Add or remove the managed MEMPALACE-HOOKS block in a CLAUDE.md, for setup.sh and uninstall.sh.

A marker counts only when it is a whole line, and markers are paired in order. Only a line feed ends
a line. When a marker has no partner, or a marker line sits inside a code fence, the file is left
untouched and the exit status is 1. Inject also stops when the file ends inside a code fence that is
never closed, since the block would land inside it. So a lost END line cannot take the user's own
text with it, unless the user wrote a whole-line END marker further down, outside any code fence. A
backup is written only when the file existed and is about to change. A leading byte order mark is
kept.

Usage:
  block.py inject <CLAUDE.md> <block-template>
  block.py remove <CLAUDE.md>
"""
import os
import re
import shutil
import sys
import time

BEGIN = re.compile(r"<!-- MEMPALACE-HOOKS:BEGIN(?:(?!-->).)*-->")
END = "<!-- MEMPALACE-HOOKS:END -->"
FENCE = re.compile(r" {0,3}(`{3,}(?!.*`)|~{3,})")   # A Markdown code fence line: ``` or ~~~.


class Refused(Exception):
    """The file cannot be changed safely. The message names the line and what to do about it."""


def unpaired(why):
    """A Refused for marker lines that do not pair up."""
    return Refused("the MEMPALACE-HOOKS markers do not pair up: %s. Restore or delete the stray marker "
                   "line by hand, then run this again" % why)


def find_blocks(lines):
    """Return the (first, last) line index of every block, pairing the marker lines in order, and the
    (line index, fence run) of a code fence still open at the end of the file, or None."""
    blocks, start, fence = [], None, None
    for i, line in enumerate(lines):
        text = line.rstrip()
        if fence is not None and (BEGIN.fullmatch(text) or text == END):
            # The managed block holds no code fence line, so a marker inside a fence is an example
            # in the user's text. Fences count from line 1: counting them from a BEGIN line inside a
            # fence would read that fence's closing line as an opening one.
            raise Refused("line %d is a MEMPALACE-HOOKS marker inside the code fence opened on line "
                          "%d. Close that fence if it was left open by mistake. If the marker is an "
                          "example, indent it or put it within a line of text. Then run this again"
                          % (i + 1, fence[0] + 1))
        if BEGIN.fullmatch(text):
            if start is not None:
                raise unpaired("line %d opens a block, but the block opened on line %d has no END "
                               "marker" % (i + 1, start + 1))
            start = i
        elif text == END:
            if start is None:
                raise unpaired("line %d is an END marker with no BEGIN marker before it" % (i + 1))
            blocks.append((start, i))
            start = None
        else:
            m = FENCE.match(text)
            run = m.group(1) if m else ""
            if fence is None:
                fence = (i, run) if run else None
            elif run and text.strip() == run and run[0] == fence[1][0] and len(run) >= len(fence[1]):
                fence = None   # A closing fence: the same character, at least as long, nothing after.
    if start is not None:
        raise unpaired("line %d opens a block that has no END marker" % (start + 1))
    return blocks, fence


def without(lines, blocks, blanks_before=False):
    """Drop the block lines and, on request, the blank lines setup put in front of each block."""
    drop = set()
    for first, last in blocks:
        drop.update(range(first, last + 1))
        while blanks_before and first > 0 and not lines[first - 1].strip():
            first -= 1
            drop.add(first)
    return "".join(line for i, line in enumerate(lines) if i not in drop)


def backup(path):
    """Copy the file beside itself. Two runs in one second must not overwrite the earlier copy.
    The copy is created exclusively and never through a symlink: a link planted at the backup
    name, dangling or not, counts as taken, so the next name is tried."""
    stem = "%s.mempalace-hooks-bak.%d" % (path, int(time.time()))
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    n = 0
    while True:
        dest = stem if n == 0 else "%s.%d" % (stem, n)
        try:
            fd = os.open(dest, flags, 0o600)
            break
        except FileExistsError:
            n += 1
    with os.fdopen(fd, "wb") as out, open(path, "rb") as src:
        shutil.copyfileobj(src, out)
    print("  backup: " + dest)


def check_link(path):
    """A CLAUDE.md that is a symlink is written through, which is what a dotfiles setup wants, but
    only to an existing Markdown file: a cloned repository's CLAUDE.md could point at a shell
    startup file or anywhere else the user can write."""
    if not os.path.islink(path):
        return
    target = os.path.realpath(path)
    if not os.path.isfile(target):
        raise Refused("it is a symlink to %s, which does not exist, so writing would create a "
                      "file outside this folder. Point the link at an existing file" % target)
    if not target.lower().endswith(".md"):
        raise Refused("it is a symlink to %s, which is not a Markdown file, so the block could "
                      "damage it. Point the link at a .md file or replace it with a regular file" % target)


def save(path, new):
    """Back up an existing file, then write the new content with its line endings untouched."""
    if os.path.exists(path):
        backup(path)
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(new)


def spans(blocks):
    """The line ranges of the blocks, for the report."""
    return ", ".join("lines %d-%d" % (first + 1, last + 1) for first, last in blocks)


def main(argv):
    if len(argv) < 2 or {"inject": 4, "remove": 3}.get(argv[1]) != len(argv):
        print(__doc__.strip())
        return 2
    action, path = argv[1], argv[2]
    old = ""
    try:
        check_link(path)
        if os.path.exists(path):
            with open(path, encoding="utf-8", newline="") as f:   # Keep CRLF as it is.
                old = f.read()
        bom = "\ufeff" if old.startswith("\ufeff") else ""   # Set aside so line 1 can be a marker.
        old = old[len(bom):]
        # Split on line feeds alone: str.splitlines also splits on a form feed, U+2028 and others, which
        # would make a marker within a line count as a whole line and put the line numbers off.
        lines = re.findall(r"[^\n]*\n|[^\n]+\Z", old)
        blocks, fence = find_blocks(lines)
        if action == "inject" and fence is not None:
            raise Refused("line %d opens a code fence that is never closed, so the block would land "
                          "inside it. Close that fence, then run this again" % (fence[0] + 1))
    except UnicodeDecodeError:
        print("mempalace-hooks: %s is not valid UTF-8. Nothing was changed." % path)
        return 1
    except Refused as e:
        print("mempalace-hooks: nothing was changed in %s: %s." % (path, e))
        return 1

    if action == "remove":
        if not blocks:
            print("  = no MEMPALACE-HOOKS block (already removed)")
            return 0
        save(path, bom + without(lines, blocks, blanks_before=True))
        print("  ✓ MEMPALACE-HOOKS block removed (%s)" % spans(blocks))
        return 0

    with open(argv[3], encoding="utf-8") as f:
        block = f.read().strip()
    nl = "\r\n" if "\r\n" in old else "\n"
    rest = without(lines, blocks).rstrip()
    new = (rest + nl + nl if rest else "") + block.replace("\n", nl) + nl
    if new == old:
        print("  = CLAUDE.md: MEMPALACE-HOOKS memory block already current, nothing to change")
        return 0
    save(path, bom + new)
    if blocks:
        print("  replaced the old block (%s)" % spans(blocks))
    print("  ✓ CLAUDE.md: MEMPALACE-HOOKS memory block injected (idempotent)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
