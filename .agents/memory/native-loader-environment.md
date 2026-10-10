---
name: Native loader environment
description: Preserving Replit's native-library loader configuration during credential-free desktop checks
---

When sanitizing a child process environment for native desktop validation, retain
the public loader/audit configuration as well as executable paths.

**Why:** Direct Electron startup failed to locate already-installed libraries
when these variables were dropped, while the normal launcher worked. Preserving
LD_AUDIT, REPLIT_LD_AUDIT and REPLIT_LD_LIBRARY_PATH allowed sandboxed native
execution without passing provider credentials to the desktop process.

**How to apply:** Preserve loader path variables selectively in local QA. Do not
copy the complete environment, disclose variable values, or disable the renderer
sandbox to work around a library-loading failure.
