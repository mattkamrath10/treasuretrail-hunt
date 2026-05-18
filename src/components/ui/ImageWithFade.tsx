import { useState, type CSSProperties, type ReactNode } from 'react';
import { ensureUiKeyframes } from './keyframes';

export function ImageWithFade({
  src,
  alt,
  style,
  fallback,
  containerStyle,
}: {
  src?: string | null;
  alt: string;
  style?: CSSProperties;
  fallback?: ReactNode;
  containerStyle?: CSSProperties;
}) {
  ensureUiKeyframes();
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return <>{fallback ?? null}</>;
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', ...containerStyle }}>
      {!loaded && (
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
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        className="tt-fade"
        style={{
          ...style,
          opacity: loaded ? 1 : 0,
          transition: 'opacity 280ms ease',
        }}
      />
    </div>
  );
}
