# Contributing

The requirement lifecycle for this repo is defined in `CLAUDE.md`; this is the
fuller walkthrough, for a human or an agent picking up work from another
device or session. It is the same process as the
[retirement-planner](https://github.com/aggallim/retirement-planner/blob/main/CONTRIBUTING.md).

There is no external issue tracker: `intent/`, `plan.md` (when written) and the
PR itself are the tracker. Push every commit and open the draft PR as early as
possible, so any device or session can pick up from the PR link alone.

## The lifecycle

1. **Intent** — run the `grilling` skill (or `grill-me` as a human) until every
   branch of the design tree is resolved and the user confirms a shared
   understanding. Then create the branch (step 2) and commit
   `intent/NNN-slug.md` as its first commit. Bug fixes also start with an
   intent (what is broken, how it was observed). Material later answers are
   appended as dated addenda, never by rewriting the original.
2. **Branch** — `<type>/NNN-slug` off `main`, per
   [Conventional Branch](https://conventionalbranch.org).
3. **Draft PR** — open as soon as the intent commit is pushed; body references
   the intent file and the current stage. Update its status line as you go.
4. **Plan (optional)** — `plan.md`, branch-only; delete in the same PR.
5. **Implement** — push as you go.
6. **Test & document** — tests, `docs/TOOL_DOCUMENTATION.md`, `CHANGELOG.md`.
7. **Mark ready for review.**
8. **Cleanup in the same PR** — move the intent to `intent/done/`; remove `plan.md`.
9. **Merge**, fast-forward local `main`, delete the local branch; the remote
   branch is deleted via https://github.com/aggallim/energy-pilot/branches.

One branch and one PR per requirement.
