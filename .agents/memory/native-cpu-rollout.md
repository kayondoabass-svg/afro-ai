---
name: Native CPU rollout
description: Numerical and distribution safeguards for KEYO-owned native acceleration
---

Keep the native CPU kernel explicitly opt-in until its platform builds and
model behavior are certified. A selected but unavailable kernel must fail,
not silently switch execution modes.

**Why:** The JavaScript path is portable; native binaries are platform-specific.
Linux evidence alone does not establish Windows/macOS runtime compatibility.

**How to apply:** Release native source rather than uncertified compiled binaries,
retain the portable default, and label platform certification separately from
source availability.

Preserve strict floating-point behavior when optimizing owned CPU kernels.
Compare full-vocabulary logits and independent causal-sequence references,
not just the generated greeting.

**Why:** Compiler fast-math or fused operations can alter accumulations and
generated tokens; faster execution without numerical checks is insufficient.

**How to apply:** Keep strict accumulation for the reference-compatible path.
If introducing lower precision, quantization or SIMD arithmetic, measure and
document its numerical tolerances rather than inheriting exact-parity claims.
