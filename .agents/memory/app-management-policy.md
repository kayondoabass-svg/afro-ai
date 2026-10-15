---
name: Customer app management and deletion
description: Unified app management, actionable publish recommendations and verified live-site removal
---

App management should be one area, not two competing project and deployment collections. Customers must be able to return to the same saved app to edit and add more.

**Why:** The user repeatedly requested one app-management area after finding published websites separate from editable projects.

**How to apply:** Preserve the source/publication distinction internally while presenting one customer-facing app library. Do not merge unrelated records by title.

Keep the post-publish QR code and recommendations. Recommendations must be clickable and lead to the corresponding product setup for that app, including domains, email and authentication.

**Why:** The user explicitly asked not to remove this notification and reported authentication leading nowhere.

**How to apply:** Verify the destination accepts the app context; a generic route existing is not proof of an app-scoped handoff.

Deleting an app must require a second confirmation where the customer types DELETE, and must remove that particular app's public live serving, including its relevant Cloudflare configuration.

**Why:** The user reported deleting an app while its live site remained accessible.

**How to apply:** Verify only owned app resources are removed, report incomplete cleanup honestly, and distinguish public removal from the separately reviewed source-retention policy. Never cancel a purchased domain registration as an incidental app deletion.
