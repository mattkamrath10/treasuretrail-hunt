---
name: AI image-import inputs must allow screenshots
description: Why AI scan/import file inputs should not force the camera, and that screenshots beat photos of screens
---
AI image-import file inputs (business-card scan, etc.) must NOT set `capture="environment"`.

**Why:** `capture="environment"` forces the live camera on mobile and removes the option to pick an existing image. Users frequently want to feed a SCREENSHOT, which is pixel-perfect — photographing a monitor produces glare/reflections/moire that make the vision OCR return all-empty fields, surfacing as "We couldn't read that card" (a soft fallback, not an error, so nothing logs).

**How to apply:** Keep `accept="image/*"` but drop `capture` so the native chooser offers camera AND photo library. Server accepts png/jpe?g/webp/gif/heic/heif data URLs.

**Quota note:** AI scans share one per-user daily pool (`claim_ai_scan_slot`, `ai_scans_log`): free=5/day, pro=100/day, keyed off `profiles.membership_tier`. Failed/empty extractions are released (row deleted) so they don't count — a "stopped working" complaint with low logged scan count is image-quality, NOT quota. Verify tier via service-role query on profiles (uuid id rejects LIKE — filter in JS).
