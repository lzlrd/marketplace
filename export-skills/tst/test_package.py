"""Tests for scripts/package.py, each run on fixture skill directories."""
import json
import os
import re
import sys
import unittest
import zipfile

from fixtures import PLUGIN, SKILL, ScriptCase, make_skill, skill_md, write


class PackageCase(ScriptCase):
    def skill(self, dir_name, **kwargs):
        return make_skill(self.tmp / "skills" / dir_name, **kwargs)

    def assert_refused(self, proc, out, *reasons):
        self.assertEqual(proc.returncode, 1, proc.stdout + proc.stderr)
        self.assertNotIn("Traceback", proc.stderr)
        for reason in reasons:
            self.assertIn(reason, proc.stdout)
        self.assertEqual(self.zips(out), [])

    def assert_packaged(self, proc, out, *zips):
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertEqual(self.zips(out), sorted(zips))


class UploadRules(PackageCase):
    """A skill that breaks a claude.ai upload rule is reported and gets no zip."""

    def test_skill_within_the_rules_is_packaged(self):
        proc, out = self.package([self.entry(self.skill("good"))])
        self.assert_packaged(proc, out, "good.zip")
        self.assertEqual(self.members(out / "good.zip"), ["good/SKILL.md"])

    def test_description_over_1024_characters(self):
        proc, out = self.package([self.entry(self.skill("long", description="d" * 1025))])
        self.assert_refused(proc, out, "description is 1025 characters (limit 1024)")

    def test_description_of_1024_characters_passes(self):
        proc, out = self.package([self.entry(self.skill("edge", description="d" * 1024))])
        self.assert_packaged(proc, out, "edge.zip")

    def test_description_over_200_characters_is_noted_and_packaged(self):
        proc, out = self.package([self.entry(self.skill("noted", description="d" * 201))])
        self.assert_packaged(proc, out, "noted.zip")
        self.assertIn("? description is 201 characters: within the validator's 1,024 but over "
                      "the 200 the claude.ai Help Center gives", proc.stdout)

    def test_description_of_200_characters_has_no_note(self):
        proc, out = self.package([self.entry(self.skill("short", description="d" * 200))])
        self.assert_packaged(proc, out, "short.zip")
        self.assertNotIn("? description", proc.stdout)

    def test_refused_skill_gets_no_note(self):
        skill = self.skill("both", description="d" * 300, extra="version: 1")
        proc, out = self.package([self.entry(skill)])
        self.assert_refused(proc, out, "version")
        self.assertNotIn("? description", proc.stdout)

    def test_folded_description_is_measured_as_its_text(self):
        folded = "description: >-\n" + "".join(f"  {'w' * 49}\n" for _ in range(21))
        skill = self.skill("folded", description=None, extra=folded)
        proc, out = self.package([self.entry(skill)])
        self.assert_refused(proc, out, "description is 1049 characters (limit 1024)")

    def test_comment_after_a_plain_description_is_not_counted(self):
        extra = "description: " + "d" * 100 + "\n  " + "d" * 99 + "  # A note for maintainers."
        skill = self.skill("commented", description=None, extra=extra)
        proc, out = self.package([self.entry(skill)])
        self.assert_packaged(proc, out, "commented.zip")

    def test_quoted_description_with_a_colon_passes(self):
        skill = self.skill("quoted", description='"Use when: the user asks. It\'s short."')
        proc, out = self.package([self.entry(skill)])
        self.assert_packaged(proc, out, "quoted.zip")

    def test_description_with_an_angle_bracket(self):
        proc, out = self.package([self.entry(self.skill("angle", description="Use <this> one."))])
        self.assert_refused(proc, out, "angle bracket")

    def test_missing_description(self):
        proc, out = self.package([self.entry(self.skill("bare", description=None))])
        self.assert_refused(proc, out, "no description")

    def test_name_outside_lowercase_digits_and_hyphens(self):
        proc, out = self.package([self.entry(self.skill("Bad_Name"))])
        self.assert_refused(proc, out, "lowercase a-z, 0-9 and hyphens")

    def test_name_with_a_misplaced_hyphen(self):
        for name in ("-lead", "trail-", "two--hyphens"):
            with self.subTest(name=name):
                proc, out = self.package([self.entry(self.skill(name))], out=self.tmp / ("out" + name))
                self.assert_refused(proc, out, "may not start or end with a hyphen or have two in a row")

    def test_name_over_64_characters(self):
        proc, out = self.package([self.entry(self.skill("a" * 65))])
        self.assert_refused(proc, out, "name is 65 characters (limit 64)")

    def test_name_with_a_reserved_word(self):
        for name, word in (("claude-helper", "claude"), ("my-anthropic-tool", "anthropic")):
            with self.subTest(name=name):
                proc, out = self.package([self.entry(self.skill(name))], out=self.tmp / name)
                self.assert_refused(proc, out, f'reserved word "{word}"')

    def test_name_that_differs_from_its_folder(self):
        skill = self.skill("folder-name", name="frontmatter-name")
        proc, out = self.package([self.entry(skill)])
        self.assert_refused(proc, out, '"folder-name"', '"frontmatter-name"')

    def test_folder_in_the_zip_is_the_frontmatter_name(self):
        skill = self.skill("taste-skill", name="design-taste-frontend")
        proc, out = self.package([self.entry(skill, name="design-taste-frontend")])
        self.assert_packaged(proc, out, "design-taste-frontend.zip")
        self.assertEqual(self.members(out / "design-taste-frontend.zip"),
                         ["design-taste-frontend/SKILL.md"])

    def test_missing_name(self):
        proc, out = self.package([self.entry(self.skill("nameless", name=None), name="nameless")])
        self.assert_refused(proc, out, "no name")

    def test_no_frontmatter(self):
        skill = self.tmp / "skills" / "plain"
        write(skill / "SKILL.md", "# Plain\n\nNo frontmatter here.\n")
        proc, out = self.package([self.entry(skill)])
        self.assert_refused(proc, out, "no frontmatter")

    def test_frontmatter_keys_outside_the_specification(self):
        skill = self.skill("keys", extra=(
            "version: 1.0.0\nallowed-tools: Read\ndependencies: python>=3.8\n"
            "argument-hint: \"[path]\"\nhooks:\n  PreToolUse: []"))
        proc, out = self.package([self.entry(skill)])
        self.assert_refused(proc, out, "argument-hint, dependencies, hooks, version")
        self.assertNotIn("allowed-tools,", proc.stdout.split("accepted:")[0])

    def test_specification_keys_pass(self):
        skill = self.skill("spec", extra=(
            "license: MIT\nmetadata:\n  author: someone\n  version: \"1.0\"\n"
            "compatibility: Needs network access\nallowed-tools: Read Bash(git status *)"))
        proc, out = self.package([self.entry(skill)])
        self.assert_packaged(proc, out, "spec.zip")

    def test_compatibility_over_500_characters(self):
        proc, out = self.package([self.entry(self.skill("compat", extra="compatibility: " + "c" * 501))])
        self.assert_refused(proc, out, "compatibility is 501 characters (limit 500)")

    def test_compatibility_of_500_characters_passes(self):
        proc, out = self.package([self.entry(self.skill("compat-ok", extra="compatibility: " + "c" * 500))])
        self.assert_packaged(proc, out, "compat-ok.zip")

    def test_plain_value_yaml_cannot_read_is_refused(self):
        # Each of these makes a YAML parser stop with an error.
        cases = {"colon-space": "description: Use when: the user asks",
                 "colon-at-end": "description: Steps:",
                 "colon-on-a-later-line": "description: first part\n  second: part",
                 "hash-then-colon": "description: Uses C#: daily",
                 "alias": "description: *bold* start",
                 "reserved-at": "description: @mention start",
                 "reserved-backtick": "description: `code` start",
                 "directive": "description: %d percent",
                 "tag": "description: !tag value",
                 "sequence": "description: - item",
                 "flow-comma": "description: , then more"}
        for label, extra in cases.items():
            with self.subTest(label):
                skill = make_skill(self.tmp / label / "yamlbad", description=None, extra=extra)
                proc, out = self.package([self.entry(skill)], out=self.tmp / label / "out")
                self.assert_refused(proc, out, "frontmatter is not valid YAML")

    def test_plain_value_yaml_reads_as_text_passes(self):
        cases = {"time": "description: Meet at 10:30 daily",
                 "url": "description: See http://x.y/z for more",
                 "no-space": "description: Reads key:value pairs",
                 "comment": "description: Short one # note: not part of it",
                 "inner-indicators": "description: very *bold*, 50% done & more! `x` @y",
                 "dash-word": "description: -x is a flag",
                 "folded": "description: >-\n  Use when: the user asks",
                 "quoted": "description: 'Use when: the user asks'",
                 "quoted-next-line": 'description:\n  "Use when: the user asks"',
                 "no-break-space": "description: Use when: the user asks"}
        for label, extra in cases.items():
            with self.subTest(label):
                skill = make_skill(self.tmp / label / "yamlok", description=None, extra=extra)
                proc, out = self.package([self.entry(skill)], out=self.tmp / label / "out")
                self.assert_packaged(proc, out, "yamlok.zip")

    def test_every_reason_is_listed_and_the_other_skills_still_ship(self):
        bad = self.skill("Bad_Claude", description="d" * 1100 + " <x>", extra="version: 2")
        proc, out = self.package([self.entry(self.skill("good")), self.entry(bad)])
        self.assertEqual(proc.returncode, 1, proc.stdout + proc.stderr)
        for reason in ("lowercase", 'reserved word "claude"', "description is 1104 characters",
                       "angle bracket", "version"):
            self.assertIn(reason, proc.stdout)
        self.assertEqual(self.zips(out), ["good.zip"])


class FileLimit(PackageCase):
    """The packager takes at most 200 files per skill, a limit of its own."""

    def big(self, dir_name, files):
        return self.skill(dir_name, files={f"assets/f{i:03}.txt": "x" for i in range(files - 1)})

    def test_200_files_pass(self):
        proc, out = self.package([self.entry(self.big("files200", 200))])
        self.assert_packaged(proc, out, "files200.zip")
        self.assertEqual(len(self.members(out / "files200.zip")), 200)

    def test_201_files_are_reported_and_no_zip_is_written(self):
        proc, out = self.package([self.entry(self.big("files201", 201))])
        self.assert_refused(proc, out, "201 files exceeds this packager's 200-file limit")
        self.assertNotIn("upload limit", proc.stdout)
        self.assertRegex(proc.stdout, r"assets/ +200 files")

    def test_limit_is_described_as_the_packagers_own(self):
        source = (SKILL / "scripts" / "package.py").read_text(encoding="utf-8")
        line = re.search(r"^MAX_FILES = 200 .*$", source, re.M).group(0)
        self.assertIn("This packager's own limit", line)
        self.assertNotIn("claude.ai rejects", line)

    def test_listing_gives_the_file_count_and_size_of_each_zip(self):
        proc, out = self.package([self.entry(self.skill("sized", files={"scripts/run.py": "x" * 10}))])
        self.assert_packaged(proc, out, "sized.zip")
        self.assertRegex(proc.stdout, r"sized\.zip +\(sized, 2 files, [\d,]+ B zipped\)")


class Curation(PackageCase):
    """Files the skill points at ship, and whatever stays behind is listed."""

    def test_root_directory_the_skill_points_into_ships(self):
        skill = self.skill("creator", files={
            "agents/grader.md": "g", "eval-viewer/generate_review.py": "", "lib/util.py": "",
            "references/a.md": ""},
            body="Read `agents/grader.md`, then run eval-viewer/generate_review.py.\n")
        proc, out = self.package([self.entry(skill)])
        self.assert_packaged(proc, out, "creator.zip")
        self.assertEqual(self.members(out / "creator.zip"), [
            "creator/SKILL.md", "creator/agents/grader.md",
            "creator/eval-viewer/generate_review.py", "creator/references/a.md"])

    def test_directory_left_out_is_listed(self):
        skill = self.skill("wide", files={"lib/util.py": "", "lib/more.py": "", "data/t.csv": ""})
        proc, out = self.package([self.entry(skill)])
        self.assert_packaged(proc, out, "wide.zip")
        self.assertEqual(self.members(out / "wide.zip"), ["wide/SKILL.md"])
        self.assertRegex(proc.stdout, r"left out.*data/ \(1 file\).*lib/ \(2 files\)")

    def test_directory_a_shipped_reference_points_into_ships(self):
        skill = self.skill("chained", files={
            "references/guide.md": "The numbers are in data/table.csv.\n", "data/table.csv": "1"})
        proc, out = self.package([self.entry(skill)])
        self.assert_packaged(proc, out, "chained.zip")
        self.assertIn("chained/data/table.csv", self.members(out / "chained.zip"))

    def test_drop_named_directory_inside_a_kept_one_ships_when_pointed_into(self):
        skill = self.skill("nested", files={
            "scripts/run.py": "", "scripts/tests/smoke.py": "", "templates/src/main.txt": ""},
            body="Check the install with scripts/tests/smoke.py.\n")
        proc, out = self.package([self.entry(skill)])
        self.assert_packaged(proc, out, "nested.zip")
        self.assertEqual(self.members(out / "nested.zip"), [
            "nested/SKILL.md", "nested/scripts/run.py", "nested/scripts/tests/smoke.py"])
        self.assertRegex(proc.stdout, r"left out.*templates/src/ \(1 file\)")

    def test_path_outside_the_skill_ships_no_root_directory(self):
        skill = self.skill("outside", files={
            ".claude/settings.local.json": '{"env": {"GITHUB_TOKEN": "fake"}}',
            ".aws/credentials": "[default]\naws_secret_access_key = fake\n",
            "private/diary.md": "", "build/artifact.bin": "", "src/notes.txt": "",
            "project/plan.md": "", "scripts/run.sh": ""},
            body="Add the hook to ~/.claude/settings.json; keys are in ~/.aws/credentials.\n"
                 "Logs go to /var/log/private/, builds to /tmp/build/out, sources to\n"
                 "$HOME/src/app, and the checkout is ~/work/project/.\n")
        proc, out = self.package([self.entry(skill)])
        self.assert_packaged(proc, out, "outside.zip")
        self.assertEqual(self.members(out / "outside.zip"),
                         ["outside/SKILL.md", "outside/scripts/run.sh"])

    def test_path_outside_the_skill_ships_no_root_file(self):
        skill = self.skill("outside-file", files={
            "settings.json": '{"env": {"GITHUB_TOKEN": "fake"}}', "credentials": "fake",
            "notes.txt": "", "guide.txt": ""},
            body="Add the hook to ~/.claude/settings.json; keys are in ~/.aws/credentials\n"
                 "and C:\\Users\\me\\notes.txt. Read ./guide.txt first.\n")
        proc, out = self.package([self.entry(skill)])
        self.assert_packaged(proc, out, "outside-file.zip")
        self.assertEqual(self.members(out / "outside-file.zip"),
                         ["outside-file/SKILL.md", "outside-file/guide.txt"])
        self.assertRegex(proc.stdout, r"not named in SKILL\.md: credentials, notes\.txt, settings\.json")

    def test_dot_and_secrets_directories_do_not_ship_when_mentioned(self):
        skill = self.skill("configs", files={
            ".claude/settings.json": "{}", ".claude/settings.local.json": '{"env": {}}',
            ".aws/credentials": "fake", "secrets/prod.txt": "fake", "Credentials/old.txt": "fake"},
            body="Copy `.claude/settings.json` into the project. Keys go in .aws/credentials,\n"
                 "secrets/prod.txt and Credentials/old.txt.\n")
        proc, out = self.package([self.entry(skill)])
        self.assert_packaged(proc, out, "configs.zip")
        self.assertEqual(self.members(out / "configs.zip"), ["configs/SKILL.md"])
        self.assertRegex(proc.stdout, r"left out.*\.aws/ \(1 file\), \.claude/ \(2 files\), "
                                      r"Credentials/ \(1 file\), secrets/ \(1 file\)")

    def test_dot_and_secrets_directories_never_ship_at_any_depth(self):
        skill = self.skill("deep-configs", files={
            "examples/demo/run.py": "",
            "examples/demo/.claude/settings.local.json": '{"env": {"GITHUB_TOKEN": "fake"}}',
            "scripts/run.sh": "", "scripts/.aws/credentials": "[default]\naws_secret_access_key = fake\n",
            "references/guide.md": "", "references/.ssh/known_hosts": "fake",
            "references/Secrets/prod.txt": "fake", "tools/run.sh": "", "tools/.gnupg/pubring.kbx": "fake"},
            body="Run tools/run.sh. The demo reads examples/demo/.claude/settings.local.json and\n"
                 "scripts/.aws/credentials.\n")
        proc, out = self.package([self.entry(skill)])
        self.assert_packaged(proc, out, "deep-configs.zip")
        self.assertEqual(self.members(out / "deep-configs.zip"), [
            "deep-configs/SKILL.md", "deep-configs/examples/demo/run.py",
            "deep-configs/references/guide.md", "deep-configs/scripts/run.sh",
            "deep-configs/tools/run.sh"])
        self.assertIn("left out, directories: examples/demo/.claude/ (1 file), references/.ssh/ "
                      "(1 file), references/Secrets/ (1 file), scripts/.aws/ (1 file), "
                      "tools/.gnupg/ (1 file)\n", proc.stdout)

    def test_paths_written_from_the_skill_root_or_the_mentioning_file_ship(self):
        skill = self.skill("rooted", files={
            "agents/grader.md": "", "tools/run.sh": "", "data/table.csv": "",
            "references/guide.md": "The numbers are in ../data/table.csv.\n"},
            body="Read ./agents/grader.md, then run ${CLAUDE_SKILL_DIR}/tools/run.sh.\n")
        proc, out = self.package([self.entry(skill)])
        self.assert_packaged(proc, out, "rooted.zip")
        self.assertEqual(self.members(out / "rooted.zip"), [
            "rooted/SKILL.md", "rooted/agents/grader.md", "rooted/data/table.csv",
            "rooted/references/guide.md", "rooted/tools/run.sh"])

    def test_dependency_and_cache_directories_never_ship(self):
        skill = self.skill("noisy", files={
            "node_modules/dep/index.js": "", ".git/HEAD": "", "scripts/run.py": "",
            "scripts/__pycache__/run.cpython-314.pyc": "", "scripts/.venv/pyvenv.cfg": "",
            "scripts/venv/pyvenv.cfg": "", "scripts/.pytest_cache/README.md": "",
            "scripts/run.pyc": ""},
            body="Run npm install to fill node_modules/ and keep .git/ and scripts/.venv/ around.\n")
        proc, out = self.package([self.entry(skill)])
        self.assert_packaged(proc, out, "noisy.zip")
        self.assertEqual(self.members(out / "noisy.zip"),
                         ["noisy/SKILL.md", "noisy/scripts/run.py"])

    def test_symlinked_subdirectory_of_a_kept_one_ships(self):
        skill = self.skill("linked", files={"references/a.md": ""})
        shared = write(self.tmp / "shared" / "deep.md", "deep").parent
        self.symlink(shared, skill / "references" / "shared")
        proc, out = self.package([self.entry(skill)])
        self.assert_packaged(proc, out, "linked.zip")
        self.assertIn("linked/references/shared/deep.md", self.members(out / "linked.zip"))

    def test_symlink_loop_is_walked_once(self):
        skill = self.skill("looped", files={"references/a.md": ""})
        self.symlink(skill / "references", skill / "references" / "again")
        proc, out = self.package([self.entry(skill)])
        self.assert_packaged(proc, out, "looped.zip")
        self.assertEqual(self.members(out / "looped.zip"),
                         ["looped/SKILL.md", "looped/references/a.md"])

    def test_root_file_ships_only_when_named_as_a_whole_word(self):
        skill = self.skill("tokens", files={
            "LICENSE": "", "LICENSE-NOTES": "", "help": "", "notes.txt": "", "uv.lock": ""},
            body="See LICENSE-NOTES for terms, pinned in `uv.lock`. Run with --help; uses a helper.\n")
        proc, out = self.package([self.entry(skill)])
        self.assert_packaged(proc, out, "tokens.zip")
        self.assertEqual(self.members(out / "tokens.zip"),
                         ["tokens/LICENSE-NOTES", "tokens/SKILL.md", "tokens/uv.lock"])
        self.assertRegex(proc.stdout, r"left out.*LICENSE, help, notes\.txt")


class Credentials(PackageCase):
    """Credential files stay out of the zip, and the warning goes by file name."""

    def test_env_file_stays_out_when_the_skill_names_it(self):
        skill = self.skill("envskill", files={".env": "KEY=fake", ".env.example": "KEY="},
                           body="Copy `.env.example` to `.env` and fill it in.\n")
        proc, out = self.package([self.entry(skill)])
        self.assert_packaged(proc, out, "envskill.zip")
        self.assertEqual(self.members(out / "envskill.zip"),
                         ["envskill/.env.example", "envskill/SKILL.md"])
        self.assertRegex(proc.stdout, r"left out, credential file name: \.env\n")

    def test_credential_files_inside_kept_directories_stay_out(self):
        skill = self.skill("keys", files={
            "scripts/run.py": "", "scripts/.npmrc": "//registry/:_authToken=fake",
            "scripts/id_ed25519": "fake", "scripts/id_ed25519.pub": "fake",
            "scripts/service-account.json": "{}", "scripts/server.key": "fake",
            "scripts/.env.production": "KEY=fake"})
        proc, out = self.package([self.entry(skill)])
        self.assert_packaged(proc, out, "keys.zip")
        self.assertEqual(self.members(out / "keys.zip"),
                         ["keys/SKILL.md", "keys/scripts/id_ed25519.pub", "keys/scripts/run.py"])
        for left in ("scripts/.npmrc", "scripts/id_ed25519,", "scripts/service-account.json",
                     "scripts/server.key", "scripts/.env.production"):
            self.assertIn(left, proc.stdout)

    def test_other_private_keys_and_credential_files_stay_out(self):
        names = ("id_dsa", "deploy.ppk", ".envrc", ".git-credentials", ".pgpass", "release.jks",
                 "app.keystore")
        files = {f"scripts/{name}": "fake" for name in names}
        files.update({"scripts/run.py": "", "scripts/id_dsa.pub": "fake"})
        proc, out = self.package([self.entry(self.skill("morekeys", files=files))])
        self.assert_packaged(proc, out, "morekeys.zip")
        self.assertEqual(self.members(out / "morekeys.zip"), [
            "morekeys/SKILL.md", "morekeys/scripts/id_dsa.pub", "morekeys/scripts/run.py"])
        self.assertIn("left out, credential file name: "
                      + ", ".join(sorted(f"scripts/{name}" for name in names)) + "\n", proc.stdout)

    def test_token_files_and_other_common_credentials_stay_out(self):
        names = ("token.json", "token.pickle", "client_secret.json",
                 "client_secret_123.apps.googleusercontent.com.json", "AuthKey_ABC123.p8",
                 "secring.gpg", "vault.kdbx", ".htpasswd", "kubeconfig")
        kept = ("client_secret.json.example", "token.json.sample", "tokens.json", "run.py")
        files = {f"scripts/{name}": "fake" for name in names + kept}
        proc, out = self.package([self.entry(self.skill("moretokens", files=files))])
        self.assert_packaged(proc, out, "moretokens.zip")
        self.assertEqual(self.members(out / "moretokens.zip"),
                         ["moretokens/SKILL.md"] + sorted(f"moretokens/scripts/{n}" for n in kept))
        self.assertIn("left out, credential file name: "
                      + ", ".join(sorted(f"scripts/{name}" for name in names)) + "\n", proc.stdout)

    def outside(self):
        """A fake ~/.ssh and ~/.aws in the throwaway home, and an ordinary folder."""
        write(self.home / ".ssh" / "id_ed25519", "FAKE PRIVATE KEY")
        write(self.home / ".ssh" / "config", "Host fake")
        write(self.home / ".aws" / "credentials", "[default]")
        write(self.home / "notes" / "secret-santa.md", "fake")
        return self.home

    def test_symlinks_to_credentials_and_private_directories_stay_out(self):
        home = self.outside()
        skill = self.skill("linky", files={"scripts/run.py": ""},
                           body="Run scripts/run.py. See helper.txt and keys/config.\n")
        self.symlink(home / ".ssh" / "id_ed25519", skill / "scripts" / "helper")
        self.symlink(home / ".ssh", skill / "scripts" / "keys")
        self.symlink(home / ".aws" / "credentials", skill / "scripts" / "creds.txt")
        self.symlink(home / ".ssh" / "config", skill / "helper.txt")
        self.symlink(home / ".ssh", skill / "keys")
        self.symlink(home / ".ssh", skill / "references")
        self.symlink(skill / "scripts" / "helper", skill / "scripts" / "chained")
        proc, out = self.package([self.entry(skill)])
        self.assert_packaged(proc, out, "linky.zip")
        self.assertEqual(self.members(out / "linky.zip"), ["linky/SKILL.md", "linky/scripts/run.py"])
        self.assertIn("left out, symlink to a credential file or a dot or secrets directory: "
                      "helper.txt, keys/, references/, scripts/chained, scripts/creds.txt, "
                      "scripts/helper, scripts/keys/\n", proc.stdout)
        self.assertNotIn("left out, directories", proc.stdout)

    def test_symlinks_to_ordinary_files_and_directories_ship(self):
        # The plugin cache sits under ~/.claude, so a link that resolves there is fine.
        vd = self.version_dir("mkt", "p", "1.0.0")
        write(vd / "shared" / "tool.py", "print(1)")
        write(vd / "shared" / "notes.md", "notes")
        skill = self.plugin_skill("mkt", "p", "1.0.0", "linked-ok", files={"scripts/run.py": ""},
                                  body="Read guide.md.\n")
        self.symlink(vd / "shared" / "tool.py", skill / "scripts" / "tool.py")
        self.symlink(vd / "shared", skill / "references")
        self.symlink(vd / "shared" / "notes.md", skill / "guide.md")
        self.symlink(self.outside() / "notes" / "secret-santa.md", skill / "scripts" / "party.md")
        proc, out = self.package([self.entry(skill)])
        self.assert_packaged(proc, out, "linked-ok.zip")
        self.assertEqual(self.members(out / "linked-ok.zip"), [
            "linked-ok/SKILL.md", "linked-ok/guide.md", "linked-ok/references/notes.md",
            "linked-ok/references/tool.py", "linked-ok/scripts/party.md",
            "linked-ok/scripts/run.py", "linked-ok/scripts/tool.py"])
        self.assertNotIn("symlink to", proc.stdout)

    def test_skill_folder_name_does_not_raise_the_warning(self):
        skill = self.skill("design-tokens", files={"references/a.md": ""})
        proc, out = self.package([self.entry(skill)])
        self.assert_packaged(proc, out, "design-tokens.zip")
        self.assertNotIn("credential-ish", proc.stdout)

    def test_credential_ish_file_name_is_flagged_without_failing(self):
        skill = self.skill("vault", files={"references/secrets/prod.json": "{}",
                                           "scripts/token-helper.py": ""})
        proc, out = self.package([self.entry(skill)])
        self.assert_packaged(proc, out, "vault.zip")
        self.assertEqual(self.members(out / "vault.zip"),
                         ["vault/SKILL.md", "vault/scripts/token-helper.py"])
        self.assertIn("credential-ish member, review before upload: vault/scripts/token-helper.py",
                      proc.stdout)
        self.assertIn("left out, directories: references/secrets/ (1 file)", proc.stdout)


class ZipNames(PackageCase):
    """One naming scheme, and no zip silently overwritten by another."""

    def test_plugin_zip_is_named_repo_plugin_name(self):
        entry = self.entry(self.skill("brandkit"), kind="plugin", repo="some-marketplace",
                           plugin="taste-skill")
        proc, out = self.package([entry])
        self.assert_packaged(proc, out, "some-marketplace-taste-skill-brandkit.zip")

    def test_manifest_shape_in_skill_md_packages_under_the_documented_names(self):
        text = (SKILL / "SKILL.md").read_text(encoding="utf-8")
        manifest = json.loads(re.search(r"Manifest shape:\n\n```json\n(.*?)```", text, re.S).group(1))
        for entry in manifest["skills"]:
            self.assertEqual(entry["skill_dir"], "/abs/path")
            entry["skill_dir"] = str(self.skill(entry["name"]))
        write(self.cwd / "qualifiers.json", json.dumps(manifest))
        command = re.search(r"python3 <skill-dir>/scripts/(package\.py .*)", text).group(1).split()
        args = [a.replace("<lenient|strict>", manifest["mode"]) for a in command[1:]]
        proc = self.run_script(command[0], *args)
        self.assert_packaged(proc, self.cwd / "skills-export",
                             "deep-research.zip", "some-marketplace-taste-skill-brandkit.zip")

    def test_two_entries_with_one_zip_name_are_both_refused(self):
        first = make_skill(self.tmp / "one" / "tools-review")
        second = make_skill(self.tmp / "two" / "tools-review")
        proc, out = self.package([self.entry(first), self.entry(second)])
        self.assert_refused(proc, out, "tools-review.zip is also the zip name of")

    def test_plugin_and_personal_names_that_join_alike_are_refused(self):
        personal = self.entry(self.skill("mkt-tools-review"))
        plugin = self.entry(make_skill(self.tmp / "cache" / "review"), kind="plugin", repo="mkt",
                            plugin="tools")
        proc, out = self.package([personal, plugin, self.entry(self.skill("good"))])
        self.assertEqual(proc.returncode, 1, proc.stdout + proc.stderr)
        self.assertIn("mkt-tools-review.zip is also the zip name of", proc.stdout)
        self.assertEqual(self.zips(out), ["good.zip"])

    def test_refused_entry_does_not_take_a_valid_one_of_the_same_zip_name_with_it(self):
        good = make_skill(self.tmp / "one" / "dup")
        wordy = make_skill(self.tmp / "two" / "dup", description="d" * 1100)
        proc, out = self.package([self.entry(good), self.entry(wordy)])
        self.assertEqual(proc.returncode, 1, proc.stdout + proc.stderr)
        self.assertIn("description is 1100 characters", proc.stdout)
        self.assertNotIn("is also the zip name of", proc.stdout)
        self.assertEqual(self.zips(out), ["dup.zip"])
        with zipfile.ZipFile(out / "dup.zip") as zf:
            self.assertIn("Does one small thing.", zf.read("dup/SKILL.md").decode())

    def test_name_that_is_a_path_writes_nothing_outside_the_output_folder(self):
        skill = self.tmp / "skills" / "escape"
        write(skill / "SKILL.md", skill_md("../escape"))
        proc, out = self.package([self.entry(skill, name="../escape")])
        self.assert_refused(proc, out, "lowercase a-z, 0-9 and hyphens")
        self.assertEqual(sorted(p.name for p in self.tmp.rglob("*.zip")), [])


class EndToEnd(PackageCase):
    """The documented flow: inventory records go into the manifest unchanged."""

    def test_inventory_records_package_as_they_are(self):
        self.plugin_skill("mkt", "taste", "1.0.0", "taste-skill", name="design-taste-frontend",
                          files={"references/a.md": ""})
        make_skill(self.home / ".claude" / "skills" / "notes")
        self.plugin_skill("mkt", "taste", "1.0.0", "wordy", description="d" * 1025)
        inv, _ = self.inventory()
        proc, out = self.package(inv["skills"])
        self.assertEqual(proc.returncode, 1, proc.stdout + proc.stderr)
        self.assertIn("NOT PACKAGED  mkt/taste/wordy", proc.stdout)
        self.assertEqual(self.zips(out), ["mkt-taste-design-taste-frontend.zip", "notes.zip"])
        self.assertEqual(self.members(out / "mkt-taste-design-taste-frontend.zip"),
                         ["design-taste-frontend/SKILL.md", "design-taste-frontend/references/a.md"])


class OutputFolder(PackageCase):
    """The output folder holds this run's zips, and the mode is checked."""

    def test_zip_from_the_previous_run_is_removed(self):
        first, second = self.entry(self.skill("aaa-good")), self.entry(self.skill("zzz-good"))
        proc, out = self.package([first, second])
        self.assert_packaged(proc, out, "aaa-good.zip", "zzz-good.zip")
        proc, out = self.package([first], mode="strict", manifest_mode="strict")
        self.assert_packaged(proc, out, "aaa-good.zip")
        self.assertIn("zzz-good.zip", proc.stdout)

    def test_zip_the_packager_did_not_write_is_left_alone_and_listed(self):
        out = self.tmp / "out"
        write(out / "holiday-photos.zip", "not ours")
        proc, out = self.package([self.entry(self.skill("good"))], out=out)
        self.assert_packaged(proc, out, "good.zip", "holiday-photos.zip")
        self.assertIn("not written by this run: holiday-photos.zip", proc.stdout)

    def test_zip_of_the_same_name_the_packager_did_not_write_is_not_overwritten(self):
        out = self.tmp / "out"
        write(out / "good.zip", "not ours")
        proc, out = self.package([self.entry(self.skill("good")), self.entry(self.skill("other"))],
                                 out=out)
        self.assertEqual(proc.returncode, 1, proc.stdout + proc.stderr)
        self.assertEqual((out / "good.zip").read_text(encoding="utf-8"), "not ours")
        self.assertIn("NOT PACKAGED  good", proc.stdout)
        self.assertIn("not written by this run: good.zip", proc.stdout)
        self.assertEqual(self.zips(out), ["good.zip", "other.zip"])

    def test_zip_from_before_the_index_is_replaced(self):
        # What export-skills 1.0.2 left in ./skills-export: the skill's folder, no index.
        out = self.tmp / "out"
        out.mkdir()
        with zipfile.ZipFile(out / "notes.zip", "w") as zf:
            zf.writestr("notes/SKILL.md", "old")
            zf.writestr("notes/scripts/.aws/credentials", "fake")
        proc, out = self.package([self.entry(self.skill("notes"))], out=out)
        self.assert_packaged(proc, out, "notes.zip")
        self.assertEqual(self.members(out / "notes.zip"), ["notes/SKILL.md"])
        self.assertIn("Replaced earlier exports of the same skills, which the index did not "
                      "list: notes.zip", proc.stdout)
        self.assertNotIn("not written by this run", proc.stdout)

    def test_zip_of_the_same_name_in_another_shape_is_not_overwritten(self):
        shapes = {"finder": {"good/SKILL.md": "x", "__MACOSX/good/._SKILL.md": "x"},
                  "other-folder": {"other/SKILL.md": "x"},
                  "no-skill-md": {"good/README.md": "x"}}
        for label, members in shapes.items():
            with self.subTest(label):
                out = self.tmp / label
                out.mkdir()
                with zipfile.ZipFile(out / "good.zip", "w") as zf:
                    for arc, text in members.items():
                        zf.writestr(arc, text)
                proc, out = self.package([self.entry(self.skill("good"))], out=out)
                self.assertEqual(proc.returncode, 1, proc.stdout + proc.stderr)
                self.assertIn("NOT PACKAGED  good", proc.stdout)
                self.assertEqual(self.members(out / "good.zip"), sorted(members))

    def test_zips_are_kept_track_of_when_the_index_is_lost(self):
        entries = [self.entry(self.skill("aaa-good")), self.entry(self.skill("zzz-good"))]
        proc, out = self.package(entries)
        self.assert_packaged(proc, out, "aaa-good.zip", "zzz-good.zip")
        (out / ".export-skills-index.json").unlink()
        proc, out = self.package(entries)
        self.assert_packaged(proc, out, "aaa-good.zip", "zzz-good.zip")
        self.assertNotIn("NOT PACKAGED", proc.stdout)

    def test_index_names_each_zip_before_it_is_written(self):
        wrapper = write(self.tmp / "interrupted.py", (
            "import os, sys\n"
            "sys.path.insert(0, sys.argv.pop(1))\n"
            "import package\n"
            "real, done = package.write_zip, []\n"
            "def write_then_die(out, job):\n"
            "    if done:\n"
            "        os._exit(130)  # The run is killed between two zips.\n"
            "    done.append(job['stem'])\n"
            "    real(out, job)\n"
            "package.write_zip = write_then_die\n"
            "sys.exit(package.main())\n"))
        entries = [self.entry(self.skill("aaa-good")), self.entry(self.skill("zzz-good"))]
        manifest = write(self.tmp / "qualifiers.json", json.dumps({"skills": entries}))
        out = self.tmp / "out"
        self.run_script(wrapper, SKILL / "scripts", "--manifest", manifest, "--out", out)
        self.assertEqual(self.zips(out), ["aaa-good.zip"])
        index = json.loads((out / ".export-skills-index.json").read_text(encoding="utf-8"))
        self.assertEqual(index["zips"], ["aaa-good.zip", "zzz-good.zip"])
        proc, out = self.package(entries[1:])
        self.assert_packaged(proc, out, "zzz-good.zip")
        self.assertIn("Removed from the previous run into this folder: aaa-good.zip", proc.stdout)

    def test_symlinks_planted_in_the_output_folder_are_not_written_through(self):
        out, victims = self.tmp / "out", self.tmp / "victims"
        names = (".export-skills-index.json.part", "good.zip.part", ".export-skills-index.json",
                 "taken.zip")
        out.mkdir()
        for name in names:
            write(victims / name, f"precious {name}")
            self.symlink(victims / name, out / name)
        proc, out = self.package([self.entry(self.skill("good")), self.entry(self.skill("taken"))],
                                 out=out)
        self.assertEqual(proc.returncode, 1, proc.stdout + proc.stderr)
        self.assertIn("NOT PACKAGED  taken", proc.stdout)
        for name in names:
            self.assertEqual((victims / name).read_text(encoding="utf-8"), f"precious {name}")
        for name in names[:2] + names[3:]:
            self.assertEqual(os.readlink(out / name), str(victims / name))
        for name in ("good.zip", ".export-skills-index.json"):
            self.assertFalse((out / name).is_symlink(), name)
        self.assertEqual(self.members(out / "good.zip"), ["good/SKILL.md"])
        self.assertEqual(sorted(p.name for p in out.iterdir()), sorted(names + ("good.zip",)))

    def test_new_zips_and_index_follow_the_umask(self):
        if sys.platform == "win32":
            self.skipTest("file modes do not apply here")
        proc, out = self.package([self.entry(self.skill("good"))])
        self.assert_packaged(proc, out, "good.zip")
        mask = os.umask(0o022)
        os.umask(mask)
        for name in ("good.zip", ".export-skills-index.json"):
            self.assertEqual((out / name).stat().st_mode & 0o777, 0o666 & ~mask, name)

    def test_read_only_index_is_replaced(self):
        if sys.platform == "win32" or os.geteuid() == 0:
            self.skipTest("file permissions do not stop this user here")
        good = self.entry(self.skill("good"))
        proc, out = self.package([good])
        self.assert_packaged(proc, out, "good.zip")
        os.chmod(out / ".export-skills-index.json", 0o444)
        proc, out = self.package([good, self.entry(self.skill("other"))])
        self.assert_packaged(proc, out, "good.zip", "other.zip")
        self.assertNotIn("Traceback", proc.stderr)
        index = json.loads((out / ".export-skills-index.json").read_text(encoding="utf-8"))
        self.assertEqual(index["zips"], ["good.zip", "other.zip"])

    def test_index_that_cannot_be_written_is_a_usage_error(self):
        out = self.tmp / "out"
        (out / ".export-skills-index.json").mkdir(parents=True)
        proc, _ = self.package([self.entry(self.skill("good"))], out=out)
        self.assertEqual(proc.returncode, 2, proc.stdout + proc.stderr)
        self.assertNotIn("Traceback", proc.stderr)
        self.assertIn("cannot use --out", proc.stderr)
        self.assertEqual(sorted(p.name for p in out.iterdir()), [".export-skills-index.json"])

    def test_output_folder_that_cannot_be_written_is_a_usage_error(self):
        if sys.platform == "win32" or os.geteuid() == 0:
            self.skipTest("folder permissions do not stop this user here")
        out = self.tmp / "ro-out"
        write(out / ".export-skills-index.json", json.dumps({"zips": ["old.zip"]}))
        write(out / "old.zip", "previous run")
        os.chmod(out, 0o555)
        self.addCleanup(os.chmod, out, 0o755)
        proc, _ = self.package([self.entry(self.skill("good"))], out=out)
        self.assertEqual(proc.returncode, 2, proc.stdout + proc.stderr)
        self.assertNotIn("Traceback", proc.stderr)
        self.assertIn("cannot use --out", proc.stderr)
        self.assertEqual(sorted(p.name for p in out.iterdir()),
                         [".export-skills-index.json", "old.zip"])

    def test_skill_refused_this_run_loses_its_zip_from_the_previous_run(self):
        skill = self.skill("drifts")
        proc, out = self.package([self.entry(skill)])
        self.assert_packaged(proc, out, "drifts.zip")
        write(skill / "SKILL.md", skill_md("drifts", description="d" * 1025))
        proc, out = self.package([self.entry(skill)])
        self.assert_refused(proc, out, "description is 1025 characters")

    def test_mode_outside_lenient_and_strict_is_rejected(self):
        proc, out = self.package([self.entry(self.skill("good"))], mode="banana")
        self.assertEqual(proc.returncode, 2, proc.stdout + proc.stderr)
        self.assertEqual(self.zips(out), [])

    def test_mode_flag_that_disagrees_with_the_manifest_is_rejected(self):
        proc, out = self.package([self.entry(self.skill("good"))], mode="strict",
                                 manifest_mode="lenient")
        self.assertEqual(proc.returncode, 2, proc.stdout + proc.stderr)
        self.assertIn("disagrees", proc.stderr)
        self.assertEqual(self.zips(out), [])

    def test_mode_is_taken_from_the_manifest_when_the_flag_is_absent(self):
        proc, out = self.package([self.entry(self.skill("good"))], manifest_mode="strict")
        self.assert_packaged(proc, out, "good.zip")
        self.assertIn("in strict mode", proc.stdout)


class BadInput(PackageCase):
    """One bad entry is reported and the rest of the batch is still packaged."""

    def test_missing_skill_dir_does_not_stop_the_batch(self):
        gone = self.entry(self.tmp / "skills" / "mmm-gone")
        proc, out = self.package([self.entry(self.skill("aaa-good")), gone,
                                  self.entry(self.skill("zzz-good"))])
        self.assertEqual(proc.returncode, 1, proc.stdout + proc.stderr)
        self.assertNotIn("Traceback", proc.stderr)
        self.assertIn("skill_dir does not exist", proc.stdout)
        self.assertEqual(self.zips(out), ["aaa-good.zip", "zzz-good.zip"])

    def test_directory_without_skill_md_gets_no_zip(self):
        hollow = self.tmp / "skills" / "hollow"
        hollow.mkdir(parents=True)
        proc, out = self.package([self.entry(hollow)])
        self.assert_refused(proc, out, "no SKILL.md")

    def test_entry_without_a_name_is_reported(self):
        proc, out = self.package([{"kind": "personal", "skill_dir": str(self.skill("good"))}])
        self.assert_refused(proc, out, "entry has no name")

    def test_manifest_that_does_not_parse_is_a_usage_error(self):
        path = write(self.tmp / "broken.json", "{not json")
        proc = self.run_script("package.py", "--manifest", path, "--out", self.tmp / "out")
        self.assertEqual(proc.returncode, 2, proc.stdout + proc.stderr)
        self.assertNotIn("Traceback", proc.stderr)


class Lists(unittest.TestCase):
    """The curation lists are written down in three places and have to agree."""

    def assigned_sets(self, script):
        import ast
        tree = ast.parse((SKILL / "scripts" / script).read_text(encoding="utf-8"))
        return {node.targets[0].id: ast.literal_eval(node.value) for node in tree.body
                if isinstance(node, ast.Assign) and isinstance(node.value, ast.Set)}

    def documented(self, label):
        text = (SKILL / "references" / "process.md").read_text(encoding="utf-8")
        bullet = re.search(r"^- \*\*" + label + r"\*\*(.*?)(?=^- |\n\n)", text, re.S | re.M).group(1)
        return set(re.findall(r"`([^`]+)`", bullet.split(";")[0]))

    def test_keep_and_drop_lists_match_the_reference(self):
        package, inventory = self.assigned_sets("package.py"), self.assigned_sets("inventory.py")
        self.assertEqual(inventory["RESOURCE_DIRS"], package["KEEP_DIRS"])
        self.assertEqual(self.documented("KEEP"), package["KEEP_DIRS"])
        self.assertEqual(self.documented("DROP"), package["DROP_DIRS"])
        self.assertLess(package["NOISE_DIRS"], package["DROP_DIRS"])

    def test_credential_names_match_the_reference(self):
        import ast
        tree = ast.parse((SKILL / "scripts" / "package.py").read_text(encoding="utf-8"))
        tuples = {node.targets[0].id: ast.literal_eval(node.value) for node in tree.body
                  if isinstance(node, ast.Assign) and isinstance(node.value, ast.Tuple)}
        text = (SKILL / "references" / "process.md").read_text(encoding="utf-8")
        bullet = re.search(r"^- Credential files never ship(.*?)(?=^- |\n\n)", text, re.S | re.M).group(1)
        names, exceptions = bullet.split("Names ending")
        self.assertEqual(set(re.findall(r"`([^`]+)`", names)), set(tuples["CREDENTIAL_FILES"]))
        self.assertEqual(set(re.findall(r"`([^`]+)`", exceptions)), set(tuples["NOT_CREDENTIALS"]))


class Instructions(unittest.TestCase):
    """What SKILL.md tells the model to do with the scripts' files and output."""

    def text(self):
        return (SKILL / "SKILL.md").read_text(encoding="utf-8")

    def test_inventory_is_written_to_a_private_work_folder(self):
        docs = [SKILL / "SKILL.md", SKILL / "references" / "process.md", PLUGIN / "README.md"]
        for path in docs:
            self.assertNotIn("/tmp/skills-inventory", path.read_text(encoding="utf-8"), path.name)
        step = re.search(r"### 1\. Inventory(.*?)(?=^### )", self.text(), re.S | re.M).group(1)
        self.assertIn("```\nmktemp -d\npython3 <skill-dir>/scripts/inventory.py > "
                      "<work-dir>/skills-inventory.json\n```", step)

    def test_report_carries_over_the_notes_and_credential_flags(self):
        report = self.text().split("### 7. Report", 1)[1]
        self.assertIn("each `?` note on a packaged skill", report)
        self.assertIn("each `credential-ish member` line", report)


if __name__ == "__main__":
    unittest.main()
