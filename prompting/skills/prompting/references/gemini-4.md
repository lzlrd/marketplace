# Gemini 4: Five Practical Tips

This file is a summary, written for the skill, of the section "5 practical tips for building with Gemini 4 Carbon" in Google's Gemini 4 Carbon developer guide (<https://aistudio.google.com/learn/gemini-4-carbon-developer-guide>, published 2026-11-10, read 2026-11-19). The guide is rendered by script and has no downloadable form, so unlike the other references this is not a copy. Open the page when exact wording matters, including its two sample prompts.

The tips were written about Gemini 4 Carbon, Google's strongest Gemini 4 model, in long autonomous coding and agent work. They are about how a task is set up more than how a prompt is worded.

## 1. Agree the Goal Before a Long Run

Carbon can work alone for a long time and holds context well once it has a clear target, so the effort goes into the start:

- State the goal and have the model ask its clarifying questions about edge cases and success criteria before it begins.
- Use the planning stage to test the design with it; the guide reports useful suggestions on architecture, data models, and API shape at this point.
- Have it confirm it can reach the tools and documents it needs and that it understands the intent.
- Then let it carry out the whole plan without turn-by-turn prompting, pausing only for confirmation before an irreversible step.

## 2. Give It Something to Verify Against

Its best long-horizon work comes when it can check its own changes against a real signal: a test suite, runtime logs, browser screenshots of the rendered interface, or a verification script it writes itself. The stronger form is a reproducible script with a recorded baseline score, rerun after every change until the target is met. With no measure available, ask the model to analyze the project and build a baseline benchmark first. The guide's sample prompt does this for accessibility: write a crawler that records the baseline, group the failures by shared root cause, fix one group at a time, and rerun after each fix.

## 3. Pass Visual References, and Use the Frontend Design Skill

Carbon accepts images, audio, video, PDFs, code, and text directly. For frontends and 3D work, hand it one or two concrete visual references, or have it first write the typography, palette, and layout rules into a short `DESIGN.md` so components stay consistent. Google publishes a `gemini-frontend-design` skill for Gemini 4 models and recommends it for interface work. For generating images, video, speech, or music through other Gemini models, the guide recommends the Gemini API CLI and its agent skill, so that media is written to the project from the terminal.

## 4. Make It the Orchestrator of a Team

On large multi-file projects, give Carbon the roles that need the deepest reasoning (architecture, coordination, security review, final verification) at `thinking_level` `medium` or `high`, and delegate parallel implementation work such as leaf-module migrations, unit tests, and frequent checks to faster subagents (the guide names Gemini 3.8 Flash and Gemini 4 Argon). It can also coordinate the specialized image, video, speech, and music models.

## 5. Have It Reflect on the Work

At the end of a hard task, or partway through a difficult one, ask the model to review the session: where it stalled, what took extra steps, and why. Two uses follow. Repository quirks it discovered (test flags, lint rules, deprecated helpers) go into `AGENTS.md` or a reusable skill, so the next session takes the direct path. A multi-step procedure it worked out becomes a skill the whole team can reuse. After a long run that touched many files, the guide also suggests asking for an interactive visual explanation of the change, such as an architecture diagram or data-flow map, as a faster check than reading the diff.
