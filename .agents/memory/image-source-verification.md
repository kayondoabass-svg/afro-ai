---
name: Verify real image-source downloads
description: Stock-photo metadata and mocked image URLs are not proof that real photo retrieval works
---

Validate the real metadata → image download → decoding → private-storage read-back path, not just metadata HTTP success or mocked legacy URLs.

**Why:** Commons returned thumbnails on a newer dedicated thumbnail hostname while tests supplied the older upload hostname. A plausible search result and a passing mock still produced no usable photographs.

**How to apply:** Check the provider's actual returned URL, explicitly allow only the required trusted hosts, reject redirects and unsupported content, and verify actual image bytes. Metadata search matching is not visual certification or evidence of the customer's real business.
