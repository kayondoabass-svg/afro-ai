---
name: KEYO desktop distribution
description: Immutable mirrored downloads and separating application ZIPs from developer bundles
---

Mirror desktop release archives byte-for-byte; do not silently replace an
existing version's executable archive to improve delivery.

**Why:** The first Windows download was slow for the user, who initially
downloaded a developer release bundle instead of the application. An alternate
host addresses routing without invalidating the original release checksum.
The bundled GUI runtime dominates size; removing required runtime files is
not a safe download-speed fix.

**How to apply:** Before exposing a mirror link for a new release, upload its
matching archive and verify the public bytes against the original SHA-256.
Show the application and separate model sizes up front, distinguish desktop
ZIPs from developer source bundles, and provide extraction and first-run steps.
Do not promise faster service everywhere or browser resume across hosts.
