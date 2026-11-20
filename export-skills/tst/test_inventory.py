"""Tests for scripts/inventory.py, each run against a fake home directory."""
import json
import os
import unittest

from fixtures import ScriptCase, make_skill, skill_md, write


class InstalledVersion(ScriptCase):
    """The version Claude Code has installed is the one inventoried."""

    def test_install_record_beats_a_replaced_version(self):
        old = self.version_dir("mkt", "hashed", "aaaaaaaaaaaa")
        new = self.version_dir("mkt", "hashed", "bbbbbbbbbbbb")
        self.plugin_skill("mkt", "hashed", "aaaaaaaaaaaa", "tool")
        self.plugin_skill("mkt", "hashed", "bbbbbbbbbbbb", "tool")
        self.installed({"hashed@mkt": new})
        self.orphan(old)
        inv, _ = self.inventory()
        self.assertEqual([r["plugin_version"] for r in inv["skills"]], ["bbbbbbbbbbbb"])
        self.assertTrue(inv["installed_plugins_known"])

    def test_install_record_beats_a_plain_numeric_version(self):
        for version in ("1.9.0", "2.0.0-rc.1"):
            self.plugin_skill("mkt", "pre", version, "tool")
        self.installed({"pre@mkt": self.version_dir("mkt", "pre", "2.0.0-rc.1")})
        self.orphan(self.version_dir("mkt", "pre", "1.9.0"))
        inv, _ = self.inventory()
        self.assertEqual([r["plugin_version"] for r in inv["skills"]], ["2.0.0-rc.1"])

    def test_skill_the_installed_version_removed_is_not_listed(self):
        for name in ("keep", "old-name"):
            self.plugin_skill("mkt", "renamer", "1.0.0", name)
        for name in ("keep", "new-name"):
            self.plugin_skill("mkt", "renamer", "2.0.0", name)
        self.installed({"renamer@mkt": self.version_dir("mkt", "renamer", "2.0.0")})
        self.orphan(self.version_dir("mkt", "renamer", "1.0.0"))
        inv, _ = self.inventory()
        self.assertEqual([(r["name"], r["plugin_version"]) for r in inv["skills"]],
                         [("keep", "2.0.0"), ("new-name", "2.0.0")])

    def test_plugin_without_an_install_record_is_not_installed(self):
        self.plugin_skill("mkt", "kept", "1.0.0", "tool")
        self.plugin_skill("mkt", "leftover", "1.0.0", "ghost")
        self.installed({"kept@mkt": self.version_dir("mkt", "kept", "1.0.0")})
        inv, _ = self.inventory()
        self.assertEqual([r["name"] for r in inv["skills"]], ["tool"])

    def test_record_of_no_installs_is_not_replaced_by_the_cache(self):
        self.plugin_skill("mkt", "ghost", "1.0.0", "ghost-skill")
        write(self.plugins / "installed_plugins.json", json.dumps({"version": 2, "plugins": {}}))
        inv, _ = self.inventory()
        self.assertEqual(inv["skills"], [])
        self.assertTrue(inv["installed_plugins_known"])

    def test_install_path_that_is_gone_is_named(self):
        self.plugin_skill("mkt", "kept", "1.0.0", "tool")
        self.plugin_skill("mkt", "moved", "1.0.0", "old")
        gone = self.version_dir("mkt", "moved", "2.0.0")
        self.installed({"kept@mkt": self.version_dir("mkt", "kept", "1.0.0"), "moved@mkt": gone})
        inv, err = self.inventory()
        self.assertEqual([r["name"] for r in inv["skills"]], ["tool"])
        self.assertEqual(inv["missing_install_paths"],
                         [{"repo": "mkt", "plugin": "moved", "path": str(gone)}])
        self.assertIn("1 install paths missing", err)

    def test_install_path_that_is_gone_does_not_bring_back_the_cache(self):
        self.plugin_skill("mkt", "moved", "1.0.0", "old")
        gone = self.version_dir("mkt", "moved", "2.0.0")
        self.installed({"moved@mkt": gone})
        inv, _ = self.inventory()
        self.assertEqual(inv["skills"], [])
        self.assertTrue(inv["installed_plugins_known"])
        self.assertEqual([m["plugin"] for m in inv["missing_install_paths"]], ["moved"])

    def test_install_path_outside_the_cache_is_inventoried(self):
        local = self.tmp / "local-marketplace" / "inplace"
        make_skill(local / "skills" / "here")
        self.installed({"inplace@local": local})
        inv, _ = self.inventory()
        self.assertEqual([(r["repo"], r["plugin"], r["name"]) for r in inv["skills"]],
                         [("local", "inplace", "here")])

    def test_without_install_records_a_replaced_version_is_skipped(self):
        self.plugin_skill("mkt", "hashed", "aaaaaaaaaaaa", "tool")
        self.plugin_skill("mkt", "hashed", "bbbbbbbbbbbb", "tool")
        self.orphan(self.version_dir("mkt", "hashed", "aaaaaaaaaaaa"))
        inv, _ = self.inventory()
        self.assertEqual([r["plugin_version"] for r in inv["skills"]], ["bbbbbbbbbbbb"])
        self.assertFalse(inv["installed_plugins_known"])

    def test_without_install_records_one_version_serves_the_whole_plugin(self):
        for name in ("keep", "old-name"):
            self.plugin_skill("mkt", "renamer", "1.0.0", name)
        for name in ("keep", "new-name"):
            self.plugin_skill("mkt", "renamer", "2.0.0-rc.1", name)
        os.utime(self.version_dir("mkt", "renamer", "1.0.0"), (1_000_000_000,) * 2)
        os.utime(self.version_dir("mkt", "renamer", "2.0.0-rc.1"), (1_500_000_000,) * 2)
        inv, _ = self.inventory()
        self.assertEqual([(r["name"], r["plugin_version"]) for r in inv["skills"]],
                         [("keep", "2.0.0-rc.1"), ("new-name", "2.0.0-rc.1")])


class DeclaredSkills(ScriptCase):
    """Only the skills a plugin loads in Claude Code are inventoried."""

    def shared_repo(self, marketplace_json_dir):
        """A plugin whose cache directory is a whole shared repository, the way
        Anthropic's example-skills is: three skills on disk, two declared."""
        vd = self.version_dir("agent-skills", "example-skills", "e4bb5d960d87")
        for name in ("alpha", "beta", "gamma"):
            self.plugin_skill("agent-skills", "example-skills", "e4bb5d960d87", name)
        write(marketplace_json_dir / ".claude-plugin" / "marketplace.json", json.dumps({
            "name": "agent-skills",
            "plugins": [
                {"name": "example-skills", "source": "./", "strict": False,
                 "skills": ["./skills/alpha", "./skills/beta"]},
                {"name": "other-skills", "source": "./", "strict": False,
                 "skills": ["./skills/gamma"]}]}))
        self.installed({"example-skills@agent-skills": vd})
        return vd

    def test_root_source_entry_lists_the_only_skills_that_load(self):
        self.shared_repo(self.version_dir("agent-skills", "example-skills", "e4bb5d960d87"))
        inv, _ = self.inventory()
        self.assertEqual([r["name"] for r in inv["skills"]], ["alpha", "beta"])

    def test_marketplace_clone_is_read_when_the_cache_holds_no_copy(self):
        self.shared_repo(self.plugins / "marketplaces" / "agent-skills")
        inv, _ = self.inventory()
        self.assertEqual([r["name"] for r in inv["skills"]], ["alpha", "beta"])

    def test_marketplace_added_from_a_local_path_is_found_by_its_install_location(self):
        self.shared_repo(self.tmp / "local-marketplace")
        write(self.plugins / "known_marketplaces.json", json.dumps({"agent-skills": {
            "source": {"source": "directory", "path": str(self.tmp / "local-marketplace")},
            "installLocation": str(self.tmp / "local-marketplace")}}))
        inv, _ = self.inventory()
        self.assertEqual([r["name"] for r in inv["skills"]], ["alpha", "beta"])

    def test_entry_skills_on_a_plugin_folder_add_to_the_default_scan(self):
        vd = self.version_dir("mkt", "sub", "1.0.0")
        self.plugin_skill("mkt", "sub", "1.0.0", "alpha")
        make_skill(vd / "more" / "gamma")
        write(self.plugins / "marketplaces" / "mkt" / ".claude-plugin" / "marketplace.json",
              json.dumps({"name": "mkt", "plugins": [
                  {"name": "sub", "source": "./plugins/sub", "skills": ["./more/gamma"]}]}))
        inv, _ = self.inventory()
        self.assertEqual([r["name"] for r in inv["skills"]], ["alpha", "gamma"])

    def manifest(self, version_dir, skills):
        write(version_dir / ".claude-plugin" / "plugin.json",
              json.dumps({"name": version_dir.parent.name, "skills": skills}))

    def test_manifest_skills_path_adds_to_the_default_scan(self):
        vd = self.version_dir("mkt", "extra", "1.0.0")
        self.plugin_skill("mkt", "extra", "1.0.0", "alpha")
        make_skill(vd / "extra-skills" / "gamma")
        self.manifest(vd, "./extra-skills/")
        inv, _ = self.inventory()
        self.assertEqual([r["name"] for r in inv["skills"]], ["alpha", "gamma"])

    def test_manifest_skills_path_may_be_one_skill_folder(self):
        vd = self.version_dir("mkt", "single", "1.0.0")
        make_skill(vd / "solo")
        self.manifest(vd, ["./solo"])
        inv, _ = self.inventory()
        self.assertEqual([r["name"] for r in inv["skills"]], ["solo"])

    def test_skills_path_that_leaves_the_plugin_is_ignored(self):
        vd = self.version_dir("mkt", "escape", "1.0.0")
        self.plugin_skill("mkt", "escape", "1.0.0", "inside")
        make_skill(vd.parent / "outside" / "stray")
        self.manifest(vd, ["../outside"])
        inv, _ = self.inventory()
        self.assertEqual([r["name"] for r in inv["skills"]], ["inside"])

    def test_root_skill_md_alone_is_the_plugin_skill(self):
        vd = self.version_dir("mkt", "humanizer", "1.0.0")
        write(vd / "SKILL.md", skill_md(None))
        inv, _ = self.inventory()
        self.assertEqual([(r["name"], r["dir_name"], r["skill_dir"]) for r in inv["skills"]],
                         [("humanizer", "humanizer", str(vd))])

    def test_root_skill_md_beside_a_skills_dir_is_not_a_skill(self):
        vd = self.version_dir("mkt", "both", "1.0.0")
        write(vd / "SKILL.md", skill_md("rootskill"))
        self.plugin_skill("mkt", "both", "1.0.0", "inner")
        inv, _ = self.inventory()
        self.assertEqual([r["name"] for r in inv["skills"]], ["inner"])

    def test_root_skill_md_listed_as_dot_loads_beside_the_skills_dir(self):
        vd = self.version_dir("mkt", "both", "1.0.0")
        write(vd / "SKILL.md", skill_md("rootskill"))
        self.plugin_skill("mkt", "both", "1.0.0", "inner")
        self.manifest(vd, ["./"])
        inv, _ = self.inventory()
        self.assertEqual(sorted(r["name"] for r in inv["skills"]), ["inner", "rootskill"])

    def test_skill_md_in_a_subfolder_of_a_plugin_without_skills_is_not_a_skill(self):
        vd = self.version_dir("mkt", "tpl", "1.0.0")
        write(vd / ".claude-plugin" / "plugin.json", json.dumps({"name": "tpl"}))
        write(vd / "commands" / "new-skill.md", "Copy skill-template/ to start a skill.\n")
        make_skill(vd / "skill-template")
        inv, _ = self.inventory()
        self.assertEqual(inv["skills"], [])

    def test_skill_md_bundled_deeper_in_a_skill_is_not_a_skill(self):
        skill = self.plugin_skill("mkt", "nest", "1.0.0", "outer")
        make_skill(skill / "examples" / "sample")
        inv, _ = self.inventory()
        self.assertEqual([r["name"] for r in inv["skills"]], ["outer"])


class EnabledPlugins(ScriptCase):
    """Disabled plugins are matched by full id and named in the output."""

    def setUp(self):
        super().setUp()
        self.plugin_skill("mktA", "foo", "1.0.0", "a-skill")
        self.plugin_skill("mktB", "foo", "1.0.0", "b-skill")

    def test_enabled_is_matched_on_the_full_plugin_id(self):
        self.settings({"foo@mktA": True, "foo@mktB": False})
        inv, err = self.inventory()
        self.assertEqual([(r["name"], r["enabled"]) for r in inv["skills"]], [("a-skill", True)])
        self.assertEqual(inv["skipped_disabled"],
                         [{"repo": "mktB", "plugin": "foo", "name": "b-skill"}])
        self.assertIn("1 disabled-plugin skills skipped", err)

    def test_every_plugin_disabled_is_known_not_unknown(self):
        self.settings({"foo@mktA": False, "foo@mktB": False})
        inv, _ = self.inventory()
        self.assertTrue(inv["enabled_plugins_known"])
        self.assertEqual(inv["skills"], [])
        self.assertEqual(sorted(s["name"] for s in inv["skipped_disabled"]),
                         ["a-skill", "b-skill"])

    def test_no_enabled_plugins_setting_keeps_everything(self):
        inv, _ = self.inventory()
        self.assertFalse(inv["enabled_plugins_known"])
        self.assertEqual([(r["name"], r["enabled"]) for r in inv["skills"]],
                         [("a-skill", None), ("b-skill", None)])
        self.assertEqual(inv["skipped_disabled"], [])

    def test_project_settings_enable_a_plugin(self):
        self.settings({"foo@mktA": False, "foo@mktB": False})
        self.settings({"foo@mktA": True}, self.cwd / ".claude" / "settings.json")
        inv, _ = self.inventory()
        self.assertEqual([r["name"] for r in inv["skills"]], ["a-skill"])
        self.assertEqual([s["name"] for s in inv["skipped_disabled"]], ["b-skill"])

    def test_plugin_no_setting_names_is_enabled(self):
        self.settings({})
        inv, _ = self.inventory()
        self.assertTrue(inv["enabled_plugins_known"])
        self.assertEqual([(r["name"], r["enabled"]) for r in inv["skills"]],
                         [("a-skill", True), ("b-skill", True)])
        self.assertEqual(inv["skipped_disabled"], [])

    def test_default_enabled_false_holds_until_a_setting_names_the_plugin(self):
        write(self.version_dir("mktB", "foo", "1.0.0") / ".claude-plugin" / "plugin.json",
              json.dumps({"name": "foo", "defaultEnabled": False}))
        self.settings({"other@mktA": True})
        inv, _ = self.inventory()
        self.assertEqual([r["name"] for r in inv["skills"]], ["a-skill"])
        self.assertEqual([s["name"] for s in inv["skipped_disabled"]], ["b-skill"])
        self.settings({"foo@mktB": True})
        inv, _ = self.inventory()
        self.assertEqual([r["name"] for r in inv["skills"]], ["a-skill", "b-skill"])

    def test_marketplace_entry_default_enabled_overrides_the_manifest(self):
        write(self.version_dir("mktA", "foo", "1.0.0") / ".claude-plugin" / "plugin.json",
              json.dumps({"name": "foo", "defaultEnabled": True}))
        write(self.plugins / "marketplaces" / "mktA" / ".claude-plugin" / "marketplace.json",
              json.dumps({"name": "mktA", "plugins": [
                  {"name": "foo", "source": "./foo", "defaultEnabled": False}]}))
        self.settings({})
        inv, _ = self.inventory()
        self.assertEqual([r["name"] for r in inv["skills"]], ["b-skill"])
        self.assertEqual([s["name"] for s in inv["skipped_disabled"]], ["a-skill"])

    def records(self, records):
        """Write installed_plugins.json from {"plugin@repo": [install, ...]}."""
        write(self.plugins / "installed_plugins.json",
              json.dumps({"version": 2, "plugins": records}))

    def install(self, repo, scope, project=None):
        record = {"scope": scope, "version": "1.0.0",
                  "installPath": str(self.version_dir(repo, "foo", "1.0.0"))}
        if project is not None:
            record["projectPath"] = str(project)
        return record

    def test_install_for_another_project_is_left_out_under_its_own_reason(self):
        other = self.tmp / "other-project"
        self.records({"foo@mktA": [self.install("mktA", "project", other)],
                      "foo@mktB": [self.install("mktB", "local", self.cwd)]})
        inv, err = self.inventory()
        self.assertEqual([r["name"] for r in inv["skills"]], ["b-skill"])
        self.assertEqual(inv["skipped_other_projects"], [
            {"repo": "mktA", "plugin": "foo", "scope": "project", "project": str(other)}])
        self.assertEqual(inv["skipped_disabled"], [])
        self.assertIn("1 plugins installed only for other projects", err)

    def test_install_for_a_parent_folder_or_at_user_scope_is_listed(self):
        self.records({"foo@mktA": [self.install("mktA", "project", self.tmp)],
                      "foo@mktB": [self.install("mktB", "local", self.tmp / "other-project"),
                                   self.install("mktB", "user")]})
        inv, _ = self.inventory()
        self.assertEqual([r["name"] for r in inv["skills"]], ["a-skill", "b-skill"])
        self.assertEqual(inv["skipped_other_projects"], [])

    def test_local_settings_override_the_user_settings(self):
        self.settings({"foo@mktA": True, "foo@mktB": True})
        self.settings({"foo@mktA": False}, self.cwd / ".claude" / "settings.local.json")
        inv, _ = self.inventory()
        self.assertEqual([r["name"] for r in inv["skills"]], ["b-skill"])
        self.assertEqual([s["name"] for s in inv["skipped_disabled"]], ["a-skill"])

    def test_key_without_a_marketplace_matches_by_plugin_name(self):
        self.settings({"foo": True})
        inv, _ = self.inventory()
        self.assertEqual(sorted(r["name"] for r in inv["skills"]), ["a-skill", "b-skill"])


class SkillRecords(ScriptCase):
    """What each record says about its skill."""

    def test_name_is_the_frontmatter_name(self):
        self.plugin_skill("mkt", "taste", "1.0.0", "taste-skill", name="design-taste-frontend")
        inv, _ = self.inventory()
        self.assertEqual([(r["name"], r["dir_name"]) for r in inv["skills"]],
                         [("design-taste-frontend", "taste-skill")])

    def test_personal_symlink_is_counted_once_under_its_frontmatter_name(self):
        real = make_skill(self.home / ".agents" / "skills" / "real-dir-name", name="fm-name")
        (self.home / ".claude" / "skills").mkdir(parents=True)
        self.symlink(real, self.home / ".claude" / "skills" / "link-name")
        inv, _ = self.inventory()
        self.assertEqual([(r["kind"], r["name"], r["dir_name"], r["skill_dir"], r["enabled"])
                          for r in inv["skills"]],
                         [("personal", "fm-name", "link-name", str(real), True)])

    def test_upload_issues_give_each_broken_rule(self):
        self.plugin_skill("mkt", "p", "1.0.0", "bad", name="My_Claude_Skill",
                          description="d" * 1021 + " <b>", extra="version: 1.0.0")
        inv, _ = self.inventory()
        issues = "\n".join(inv["skills"][0]["upload_issues"])
        for reason in ("lowercase", 'reserved word "claude"', "description is 1025 characters (limit 1024)",
                       "angle bracket", "version"):
            self.assertIn(reason, issues)

    def test_skill_within_the_rules_has_no_upload_issues(self):
        self.plugin_skill("mkt", "p", "1.0.0", "good", extra="license: MIT")
        inv, _ = self.inventory()
        self.assertEqual(inv["skills"][0]["upload_issues"], [])

    def test_folded_description_is_measured_as_its_text(self):
        folded = "description: >-\n" + "".join(f"  {'w' * 49}\n" for _ in range(20))
        self.plugin_skill("mkt", "p", "1.0.0", "folded-ok", description=None, extra=folded)
        longer = "description: >-\n" + "".join(f"  {'w' * 49}\n" for _ in range(21))
        self.plugin_skill("mkt", "p", "1.0.0", "folded-long", description=None, extra=longer)
        inv, _ = self.inventory()
        records = self.plugin_records(inv, "p")
        self.assertEqual(records["folded-ok"]["upload_issues"], [])
        self.assertEqual(records["folded-long"]["upload_issues"],
                         ["description is 1049 characters (limit 1024)"])

    def test_directories_and_files_outside_the_keep_list_are_listed(self):
        self.plugin_skill("mkt", "p", "1.0.0", "wide", files={
            "references/a.md": "", "lib/util.py": "", "data/table.csv": "", "LICENSE.txt": ""})
        inv, _ = self.inventory()
        rec = inv["skills"][0]
        self.assertEqual((rec["resource_dirs"], rec["other_dirs"], rec["root_files"]),
                         (["references"], ["data", "lib"], ["LICENSE.txt"]))


class DesktopConfig(ScriptCase):
    """The Desktop MCP list, and why it could not be read when it could not."""

    def config(self, text):
        write(self.desktop_dir() / "claude_desktop_config.json", text)

    def test_servers_are_listed(self):
        self.config(json.dumps({"mcpServers": {"zeta": {}, "alpha": {}}}))
        inv, _ = self.inventory()
        self.assertEqual((inv["desktop_mcp_servers"], inv["desktop_config_found"],
                          inv["desktop_config_error"]), (["alpha", "zeta"], True, None))

    def test_missing_config_is_not_an_error(self):
        inv, err = self.inventory()
        self.assertEqual((inv["desktop_config_found"], inv["desktop_config_error"]), (False, None))
        self.assertIn("NO desktop config", err)

    def test_config_that_does_not_parse_is_reported_apart_from_a_missing_one(self):
        self.config('{"mcpServers": {"alpha": {}},}')
        inv, err = self.inventory()
        self.assertFalse(inv["desktop_config_found"])
        self.assertIn("line 1", inv["desktop_config_error"])
        self.assertIn("desktop config UNREADABLE", err)

    def test_byte_order_mark_does_not_hide_the_config(self):
        self.config("﻿" + json.dumps({"mcpServers": {"alpha": {}}}))
        inv, _ = self.inventory()
        self.assertEqual((inv["desktop_mcp_servers"], inv["desktop_config_found"]),
                         (["alpha"], True))

    def test_desktop_extensions_are_listed(self):
        write(self.desktop_dir() / "extensions-installations.json", json.dumps({"extensions": {
            "ant.dir.example.files": {
                "id": "ant.dir.example.files", "version": "1.0.0",
                "manifest": {"name": "files", "display_name": "Files",
                             "server": {"type": "node", "mcp_config": {"command": "node"}}}}}}))
        inv, err = self.inventory()
        self.assertEqual(inv["desktop_extensions"],
                         [{"id": "ant.dir.example.files", "name": "files"}])
        self.assertIn("1 Desktop extensions", err)

    def test_extensions_file_in_an_unknown_shape_is_ignored(self):
        write(self.desktop_dir() / "extensions-installations.json", "[1, 2]")
        inv, _ = self.inventory()
        self.assertEqual(inv["desktop_extensions"], [])


class PluginsRoot(ScriptCase):
    """Where the plugin cache is looked for."""

    def test_plugin_cache_dir_variable_moves_the_plugins_root(self):
        root = self.tmp / "elsewhere"
        make_skill(root / "cache" / "mkt" / "moved" / "1.0.0" / "skills" / "tool")
        inv, _ = self.inventory(CLAUDE_CODE_PLUGIN_CACHE_DIR=str(root))
        self.assertEqual([r["name"] for r in inv["skills"]], ["tool"])
        self.assertTrue(inv["plugin_cache_found"])

    def test_missing_plugin_cache_is_reported(self):
        inv, err = self.inventory()
        self.assertFalse(inv["plugin_cache_found"])
        self.assertIn("NO plugin cache", err)


class ConfigDir(ScriptCase):
    """CLAUDE_CONFIG_DIR moves what Claude Code keeps in ~/.claude."""

    def setUp(self):
        super().setUp()
        # Decoys under ~/.claude, which the variable takes the place of.
        make_skill(self.home / ".claude" / "skills" / "decoy")
        self.plugin_skill("mkt", "decoyplug", "1.0.0", "decoy-tool")
        self.installed({"decoyplug@mkt": self.version_dir("mkt", "decoyplug", "1.0.0")})
        self.settings({"kept@mkt": False})
        # The real install, in a config folder of its own.
        self.config = self.tmp / "config"
        plugins = self.config / "plugins"
        for plugin, skill in (("kept", "tool"), ("off", "ghost")):
            make_skill(plugins / "cache" / "mkt" / plugin / "1.0.0" / "skills" / skill)
        write(plugins / "installed_plugins.json", json.dumps({"version": 2, "plugins": {
            f"{plugin}@mkt": [{"scope": "user", "version": "1.0.0",
                               "installPath": str(plugins / "cache" / "mkt" / plugin / "1.0.0")}]
            for plugin in ("kept", "off")}}))
        self.settings({"off@mkt": False}, self.config / "settings.json")
        make_skill(self.config / "skills" / "mine")

    def test_config_dir_variable_moves_settings_plugins_and_personal_skills(self):
        inv, _ = self.inventory(CLAUDE_CONFIG_DIR=str(self.config))
        self.assertEqual([(r["kind"], r["name"]) for r in inv["skills"]],
                         [("personal", "mine"), ("plugin", "tool")])
        self.assertEqual(inv["skipped_disabled"], [{"repo": "mkt", "plugin": "off", "name": "ghost"}])
        self.assertTrue(inv["installed_plugins_known"])
        self.assertTrue(inv["plugin_cache_found"])

    def test_without_the_variable_home_claude_is_read(self):
        inv, _ = self.inventory()
        self.assertEqual([(r["kind"], r["name"]) for r in inv["skills"]],
                         [("personal", "decoy"), ("plugin", "decoy-tool")])

    def test_plugin_cache_dir_variable_still_moves_the_plugins_root(self):
        root = self.tmp / "elsewhere"
        make_skill(root / "cache" / "mkt" / "moved" / "1.0.0" / "skills" / "moved-tool")
        inv, _ = self.inventory(CLAUDE_CONFIG_DIR=str(self.config),
                                CLAUDE_CODE_PLUGIN_CACHE_DIR=str(root))
        self.assertEqual([(r["kind"], r["name"]) for r in inv["skills"]],
                         [("personal", "mine"), ("plugin", "moved-tool")])


if __name__ == "__main__":
    unittest.main()
