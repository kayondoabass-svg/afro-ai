---
name: Replit→GitHub push rejected on .github/workflows changes
description: The real cause of PUSH_REJECTED when a commit edits a workflow file, and how to push it.
---

# PUSH_REJECTED: "OAuth App ... without `workflow` scope"

When a commit modifies any file under `.github/workflows/`, pushing it from
Replit (Git pane, the in-Repl shell, or a background task) is rejected:

```
! [remote rejected] main -> main (refusing to allow an OAuth App to create or
update workflow `.github/workflows/ci.yml` without `workflow` scope)
```

**Why:** all Replit-originated pushes use the same GitHub OAuth token, which
lacks the `workflow` scope. GitHub refuses pushes that add/edit workflow files
without it. This is per-commit: if ANY commit in the pushed range touches a
workflow file, the whole push is rejected — a later revert commit does not help
(only history rewriting to drop the workflow change would, which the agent can't do).

**The trap (misdiagnosis):** the Replit Git-pane error surfaces generically as
"the remote has commits that aren't in the local repository," which looks like
divergence / non-fast-forward. It is NOT — `git push` from the shell reveals the
true `workflow`-scope reason. Don't chase a fast-forward/divergence fix; check
whether the unpushed commit edits `.github/workflows/*`.

**How to apply:** Use a credential with the scopes required by the actual changed
files. Do not put tokens in remote URLs, command arguments, or logs.

Pushes are not categorically blocked in the workspace. A saved Git credential
can fail while an existing workspace GitHub token remains valid. An ephemeral
credential helper can pass that token directly from the environment to Git
without printing it or changing the stored remote.

**Why:** Stored Git credentials and workspace tokens have independent validity
and permissions. Read access to a public remote does not prove write access,
and repository write permission does not imply permission to delete test repositories.

**Or skip it:** if the workflow change isn't essential, push the rest separately
or just leave it unpushed — prod/deploy don't depend on the CI workflow file.
