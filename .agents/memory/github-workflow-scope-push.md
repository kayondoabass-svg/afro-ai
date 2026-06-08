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

**How to push it (need a workflow-scoped credential — agent CANNOT do this, the
sandbox blocks all pushes; the user must run it):**
- Create a GitHub PAT (classic) with `repo` + `workflow` scopes, then one-off:
  `git push https://USER:TOKEN@github.com/<owner>/<repo>.git main`
  (don't set it as the saved remote; clear shell history after).
- Or reconnect Replit's GitHub with the `workflow` permission so the Git pane works.

**Or skip it:** if the workflow change isn't essential, push the rest separately
or just leave it unpushed — prod/deploy don't depend on the CI workflow file.
