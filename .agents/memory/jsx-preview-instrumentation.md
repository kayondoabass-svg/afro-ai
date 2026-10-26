---
name: JSX preview instrumentation
description: Named Fragment wrappers can receive unsupported preview metadata props.
---
The preview's JSX instrumentation may inject `data-replit-metadata` into a
named React Fragment, producing console warnings even though React accepts the
uninstrumented source.

**Why:** A keyed account-boundary Fragment worked in tests and builds but
warned in the running preview because Fragment only accepts key and children.

**How to apply:** For keyed remount boundaries that need a real wrapper, use a
semantic element or a `display: contents` element when layout must be preserved.
Check preview logs as well as build/test results.
