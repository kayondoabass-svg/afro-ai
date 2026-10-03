---
name: Wide image delivery
description: Aspect-ratio limitations observed while creating social cover artwork
---
Verify the actual dimensions of generated or edited images before delivering a requested landscape cover.

**Why:** Image editing returned square artwork both from a square logo and from an explicitly wide source canvas despite landscape instructions. Repeating aspect-ratio instructions alone did not resolve it.

**How to apply:** Use image generation for artwork, then compose a correctly sized cover with ImageMagick when necessary. Preserve the original approved logo and render exact wording programmatically. Inspect the final layout for clipping and overlapping text.