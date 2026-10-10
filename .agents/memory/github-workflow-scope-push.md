---
name: GitHub push authentication and workflow permissions
description: Distinguishing credential failures, workflow-scope rejection and misleading connection status
---

# PUSH_REJECTED: "OAuth App ... without `workflow` scope"

A previous push modifying `.github/workflows/` was rejected with:

```
! [remote rejected] main -> main (refusing to allow an OAuth App to create or
update workflow `.github/workflows/ci.yml` without `workflow` scope)
```

**Why:** the credential used for that push lacked `workflow` scope. This is not
a blanket restriction on every Replit credential. GitHub refuses pushes that add/edit workflow files
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

Git-provider binding and advertised connection health/scopes do not prove a
Git CLI push will authenticate.

**Why:** A source-control binding reported active/healthy while Git rejected the
credential. Standard integration reconnect/setup forms also refused that
git-provider connection identifier rather than opening a usable form.

**How to apply:** Distinguish authentication rejection from workflow rejection.
Do not repeatedly present the same failing integration form. Use the appropriate
source-control authorization flow or an isolated source ZIP for manual upload,
especially when the user chooses the ZIP. Confirm publication from the target
repository before claiming a successful upload.
