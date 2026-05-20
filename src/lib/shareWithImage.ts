// Share helper used by ListingDetail / FindDetail.
//
// Why this exists: the site is a static SPA, so link-unfurl previews
// (iMessage, WhatsApp, Slack, etc.) only see the static OG image from
// index.html — never the listing's actual photo. Per-listing OG would
// require server-side rendering, which we don't have.
//
// Workaround: when the device supports Web Share Level 2 (iOS 15+,
// Android Chrome), we fetch the listing's image and attach it as a
// File to navigator.share(). iMessage then embeds the photo inline
// in the conversation — exactly what a buyer needs to see before
// they decide to tap through.
//
// We fall back to URL-only share, then clipboard, so older browsers
// and desktop still work.

export type ShareInput = {
  url: string;
  title: string;
  text?: string;
  imageUrl?: string | null;
};

export type ShareResult =
  | { kind: 'shared' }
  | { kind: 'copied' }
  | { kind: 'cancelled' }
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string };

async function fetchAsFile(imageUrl: string): Promise<File | null> {
  try {
    // Supabase storage public URLs are CORS-enabled, so a plain fetch
    // works. We deliberately do NOT set mode: 'no-cors' — an opaque
    // response would give us a 0-byte blob.
    const res = await fetch(imageUrl, { credentials: 'omit' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;
    const type = blob.type || 'image/jpeg';
    const ext = type.split('/')[1]?.split('+')[0] || 'jpg';
    return new File([blob], `treasuretrail-find.${ext}`, { type });
  } catch {
    return null;
  }
}

export async function shareWithImage(input: ShareInput): Promise<ShareResult> {
  const { url, title, text, imageUrl } = input;
  const nav: any = typeof navigator !== 'undefined' ? navigator : null;
  const body = text || title;

  if (nav && typeof nav.share === 'function') {
    // Try image-as-file share first so iMessage / WhatsApp embed the
    // actual photo. Only attempt if the browser advertises file
    // support via canShare — otherwise nav.share() throws on iOS.
    if (imageUrl && typeof nav.canShare === 'function') {
      const file = await fetchAsFile(imageUrl);
      if (file) {
        // iOS Safari is strict about mixed payloads: passing `text` or
        // `url` alongside `files` often makes the share sheet drop the
        // text or fail silently. We send files + title only — the user
        // can re-share the URL from the bare listing page if they want
        // a tappable link, but the photo is what makes the message
        // useful to the recipient.
        const payload = { title, files: [file] };
        try {
          if (nav.canShare(payload)) {
            await nav.share(payload);
            return { kind: 'shared' };
          }
        } catch (err: any) {
          if (err?.name === 'AbortError') return { kind: 'cancelled' };
          // Fall through to URL-only share. Note: a second nav.share()
          // call here may be rejected on some browsers because the
          // original transient activation was already consumed by the
          // failed file-share attempt. That's acceptable — the user
          // will see the toast fallback and can tap Share again.
        }
      }
    }

    try {
      await nav.share({ title, text: body, url });
      return { kind: 'shared' };
    } catch (err: any) {
      if (err?.name === 'AbortError') return { kind: 'cancelled' };
      // Fall through to clipboard
    }
  }

  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(url);
      return { kind: 'copied' };
    } catch (err: any) {
      return { kind: 'error', message: err?.message || 'Clipboard blocked' };
    }
  }

  return { kind: 'unsupported' };
}
