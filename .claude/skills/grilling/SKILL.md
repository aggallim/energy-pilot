---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet.

Ask the whole frontier in one round, using the `AskUserQuestion` tool — never a text block. Each frontier question becomes one question object:

- **header:** a short (≤12 character) topic chip.
- **question:** restate the relevant context in 1-2 sentences, then ask exactly one decision. The person answering may not be the one who originated the idea being grilled, so don't assume they're carrying context from earlier in the conversation — remind them what's at stake before asking. If a question would bundle more than one decision, split it into separate questions instead.
- **options:** 2-4, whatever the decision naturally needs — don't pad to a fixed count. Your recommended answer is always **option 1**, with `" (Recommended)"` appended to its label, per the tool's own convention. Put the trade-off reasoning for each option in its `description`, not in the question body. The tool always offers "Other" for free text, so you don't need an explicit stub option to catch an answer that doesn't fit.
- **multiSelect:** `true` only for a genuinely "pick any that apply" decision. Everything else — including anything that looks like a checklist but is really several independent yes/no calls — is single-choice, asked as separate questions.

`AskUserQuestion` caps a single call at 4 questions. When a round's frontier has more than 4, split it across multiple back-to-back calls — that's still one round; don't recap between those calls, only between rounds.

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Before asking the next round's questions, post a short plain-text recap of what's now settled — the question cards don't carry history themselves, so this replaces scrolling back through the transcript. Then recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Confirm this with the user in plain chat — "does this look like a shared understanding?" — rather than a structured question: the answer here is itself open-ended ("not yet, because...") rather than a pick from options. Do not act on it until the user confirms.

---

Adapted from [`mattpocock/skills`](https://github.com/mattpocock/skills)
(`skills/productivity/grilling/SKILL.md`), MIT License, © Matt Pocock.
Questions are now asked with the `AskUserQuestion` tool (native
clickable cards, one decision per question, recommendation as option 1)
instead of a single markdown block — a Claude Code capability not
assumed by the upstream skill. See `intent/done/028-grilling-structured-questions.md`
for why. Otherwise unchanged from upstream.

## Use in this repo

This repo's requirement lifecycle (`CLAUDE.md`, `CONTRIBUTING.md`) requires
running this skill — or its user-invoked entry point, `grill-me` — to
interrogate a requirement's design tree *before* writing
`intent/NNN-slug.md`. The intent file should record the resolved decisions
this interview produces, not a restated version of the original request.
