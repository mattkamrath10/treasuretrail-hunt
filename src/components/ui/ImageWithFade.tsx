import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ensureUiKeyframes } from './keyframes';

export function ImageWithFade({
  src,
  alt,
  style,
  fallback,
  fallbackSrc,
  containerStyle,
  eager,
}: {
  src?: string | null;
  alt: string;
  style?: CSSProperties;
  fallback?: ReactNode;
  // If the primary `src` fails (typically because we asked for a
  // thumbnail that doesn't exist yet for legacy uploads), swap to
  // this URL once before giving up and rendering `fallback`.
  fallbackSrc?: string | null;
  containerStyle?: CSSProperties;
  // Above-the-fold hero images (detail-page heroes, the first feed
  // card) pass eager=true to skip lazy-loading.
  eager?: boolean;
}) {
  ensureUiKeyframes();
  const [loaded, setLoaded] = useState(false);
  const [currentSrc, setCurrentSrc] = useState<string | null | undefined>(src);
  const [errored, setErrored] = useState(false);

  // Reset state whenever the parent passes a new src. Without this the
  // component would keep showing the previous image (or stay stuck at
  // opacity 0) when reused inside a virtualized list or when the user
  // navigates between detail pages without a unique key.
  useEffect(() => {
    setCurrentSrc(src);
    setLoaded(false);
    setErrored(false);
  }, [src]);

  const handleError = () => {
    // Log once per failed URL so prod issues are diagnosable from the
    // browser console without us having to reproduce locally.
    if (currentSrc) console.warn('[ImageWithFade] load failed', currentSrc);
    if (fallbackSrc && currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc);
      setLoaded(false);
      return;
    }
    setErrored(true);
  };

  const hasImage = !!currentSrc && !errored;

  // Render the `fallback` element as the ALWAYS-ON background layer.
  // The <img> fades in on top once it loads. This kills the light-mode
  // shimmer that previously flashed across dark Discover cards while
  // also guaranteeing "never a blank gray box" — there's always a
  // branded gradient underneath every media slot.
  //
  // If no `fallback` was supplied we keep the legacy shimmer for
  // backwards-compat with non-dark surfaces.
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', ...containerStyle }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {fallback ?? (
          <div
            aria-hidden="true"
            className="tt-shimmer"
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(90deg, var(--color-neutral-100) 0px, var(--color-neutral-50) 200px, var(--color-neutral-100) 400px)',
              backgroundSize: '800px 100%',
              animation: 'ttShimmer 1.4s ease-in-out infinite',
            }}
          />
        )}
      </div>
      {hasImage && (
        <img
          src={currentSrc as string}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={handleError}
          className="tt-fade"
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            ...style,
            opacity: loaded ? 1 : 0,
            transition: 'opacity 220ms ease',
          }}
        />
      )}
    </div>
  );
}
