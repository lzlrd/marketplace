"""SKILL.md frontmatter reader and claude.ai upload rules, shared by inventory.py
and package.py.

Standard library only, so the scripts run without PyYAML. The reader covers what
SKILL.md frontmatter uses in practice: plain, quoted, folded (>) and literal (|)
scalars, including ones that run over several lines. A nested mapping or a list
is recognized as "not a string" and its contents are not parsed. A plain value
that makes a YAML parser stop with an error, the usual cause being an unquoted
": " in it, is returned as NotYaml so the upload rules can report it.
"""
import re
from pathlib import Path

# The upload rules, as Anthropic's own validator applies them (quick_validate.py in
# anthropics/skills, which the Claude Code docs say claude.ai uploads share: an
# unexpected key fails with "Allowed properties are: allowed-tools, compatibility,
# description, license, metadata, name"). claude.com's "Create custom skills" page
# gives the same 1,024-character description limit for uploads; the reserved words
# come from the platform docs. The claude.ai Help Center disagrees: it gives a
# 200-character description and lists a `dependencies` key. A description between the two limits gets a note, not a
# refusal (upload_notes); set MAX_DESCRIPTION to HELP_CENTER_DESCRIPTION to refuse it.
ALLOWED_KEYS = ("name", "description", "license", "allowed-tools", "metadata", "compatibility")
MAX_NAME = 64
MAX_DESCRIPTION = 1024
HELP_CENTER_DESCRIPTION = 200
MAX_COMPATIBILITY = 500
RESERVED_WORDS = ("anthropic", "claude")
NAME_RE = re.compile(r"[a-z0-9-]+")

# A top-level `key:` line. The key may be quoted; the value, if any, follows a space.
KEY_RE = re.compile(r"""^(?P<q>['"]?)(?P<key>[^\s'":#][^'":]*?)(?P=q)\s*:(?:[ \t]+(?P<rest>.*))?$""")
ESCAPES = {"n": "\n", "t": "\t", "0": "\0", " ": " "}
# How a plain value may not start: an alias, a reserved or directive character, a
# flow separator, a local tag, or a sequence, key or anchor indicator on its own.
BAD_START_RE = re.compile(r"[*@`%,\]}]|![^! \t]|[-?&]([ \t]|$)")


class NotYaml(str):
    """A plain value as its lines spell it, where a YAML parser stops with an
    error instead. `why` says what it trips on."""

    def __new__(cls, text, why):
        value = super().__new__(cls, text)
        value.why = why
        return value


def _fold(lines):
    """Join lines the way YAML folds them: a line break becomes a space and a
    blank line becomes a line break."""
    out = ""
    for line in lines:
        line = line.strip()
        if not line:
            out += "\n"
        elif out and not out.endswith("\n"):
            out += " " + line
        else:
            out += line
    return out.strip()


def _block(style, block):
    """A `|` (literal) or `>` (folded) block scalar, without its indentation."""
    filled = [line for line in block if line.strip()]
    indent = min((len(line) - len(line.lstrip()) for line in filled), default=0)
    lines = [line[indent:] for line in block]
    return "\n".join(lines).strip() if style == "|" else _fold(lines)


def _quoted(raw):
    """The text between the quote that opens `raw` and the one that closes it."""
    quote, out, i = raw[0], [], 1
    while i < len(raw):
        ch = raw[i]
        if quote == '"' and ch == "\\" and i + 1 < len(raw):
            out.append(ESCAPES.get(raw[i + 1], raw[i + 1]))
            i += 2
        elif ch == quote and quote == "'" and raw[i + 1:i + 2] == "'":
            out.append("'")
            i += 2
        elif ch == quote:
            break
        else:
            out.append(ch)
            i += 1
    return "".join(out)


def _scalar(rest, block):
    """The string value of one key, or None when the value is not a string."""
    if rest[:1] in ("|", ">"):
        return _block(rest[0], block)
    if rest[:1] in ('"', "'"):
        return _quoted(_fold([rest] + block))
    if rest[:1] in ("[", "{"):
        return None  # A flow list or mapping.
    # A plain scalar: a `#` after whitespace starts a comment on any of its lines.
    lines = [re.sub(r"(^|\s)#.*$", "", line) for line in [rest] + block]
    if not lines[0].strip():
        first = next((line.strip() for line in lines if line.strip()), "")
        if not first or first == "-" or first.startswith("- ") or KEY_RE.match(first):
            return None  # Empty, a list, or a nested mapping.
        if first[:1] in ('"', "'"):
            return _quoted(_fold(block))  # A quoted value that starts on the next line.
    text = _fold(lines)
    if any(re.search(r":([ \t]|$)", line) for line in lines):
        return NotYaml(text, 'it has ": " in it')
    if BAD_START_RE.match(text):
        return NotYaml(text, f'it starts with "{text[0]}"')
    return text


def read_frontmatter(skill_md):
    """Return {key: value} for the top-level frontmatter keys of a SKILL.md, or
    None when the file cannot be read or has no frontmatter block. A value is a
    string for a scalar and None for anything else."""
    try:
        lines = Path(skill_md).read_text(encoding="utf-8-sig", errors="replace").splitlines()
    except OSError:
        return None
    if not lines or lines[0].rstrip() != "---":
        return None
    end = next((i for i, line in enumerate(lines[1:], 1) if line.rstrip() in ("---", "...")), None)
    if end is None:
        return None
    fields, i = {}, 1
    while i < end:
        match = KEY_RE.match(lines[i])
        i += 1
        if not match:
            continue  # A comment or a blank line.
        block = []
        while i < end and (not lines[i].strip() or lines[i][0] in " \t"):
            block.append(lines[i])
            i += 1
        fields[match.group("key")] = _scalar((match.group("rest") or "").strip(), block)
    return fields


def frontmatter_name(fields):
    """The frontmatter `name`, or None when there is none to speak of."""
    name = (fields or {}).get("name")
    return name.strip() if isinstance(name, str) and name.strip() else None


def upload_issues(fields):
    """Why claude.ai would reject this frontmatter on upload: one sentence per
    broken rule, and an empty list when it passes. The folder a skill is zipped
    under and its file count are package.py's to check."""
    if fields is None:
        return ["SKILL.md has no frontmatter, so no name or description"]
    issues = [f"frontmatter is not valid YAML: the unquoted {key} value cannot be read as "
              f"text because {value.why}; quote it"
              for key, value in fields.items() if isinstance(value, NotYaml)]
    name = frontmatter_name(fields)
    if name is None:
        issues.append("frontmatter has no name")
    else:
        if not NAME_RE.fullmatch(name):
            issues.append(f'name "{name}" may only use lowercase a-z, 0-9 and hyphens')
        elif name.startswith("-") or name.endswith("-") or "--" in name:
            issues.append(f'name "{name}" may not start or end with a hyphen or have two in a row')
        if len(name) > MAX_NAME:
            issues.append(f"name is {len(name)} characters (limit {MAX_NAME})")
        for word in RESERVED_WORDS:
            if word in name.lower():
                issues.append(f'name "{name}" contains the reserved word "{word}"')
    description = fields.get("description")
    description = description.strip() if isinstance(description, str) else ""
    if not description:
        issues.append("frontmatter has no description")
    else:
        if len(description) > MAX_DESCRIPTION:
            issues.append(f"description is {len(description)} characters "
                          f"(limit {MAX_DESCRIPTION})")
        if "<" in description or ">" in description:
            issues.append("description contains an angle bracket (< or >)")
    compatibility = fields.get("compatibility")
    if isinstance(compatibility, str) and len(compatibility.strip()) > MAX_COMPATIBILITY:
        issues.append(f"compatibility is {len(compatibility.strip())} characters "
                      f"(limit {MAX_COMPATIBILITY})")
    extra = sorted(key for key in fields if key not in ALLOWED_KEYS)
    if extra:
        issues.append(f"frontmatter keys claude.ai does not accept: {', '.join(extra)} "
                      f"(accepted: {', '.join(ALLOWED_KEYS)})")
    return issues


def upload_notes(fields):
    """Points where Anthropic's pages disagree about an upload, for a skill that
    passes upload_issues: one sentence each. They do not stop a zip."""
    description = (fields or {}).get("description")
    description = description.strip() if isinstance(description, str) else ""
    if HELP_CENTER_DESCRIPTION < len(description) <= MAX_DESCRIPTION:
        return [f"description is {len(description)} characters: within the validator's "
                f"{MAX_DESCRIPTION:,} but over the {HELP_CENTER_DESCRIPTION} the claude.ai "
                f"Help Center gives; if the upload refuses it, shorten a copy"]
    return []
