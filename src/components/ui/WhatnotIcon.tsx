import type { CSSProperties } from 'react';

// Whatnot's "W" mark. Lives in public/whatnot-logo.jpg so it can be
// referenced as a regular URL (no @assets alias is configured). The
// official asset is a yellow W on a black rounded-square tile — when
// it's used as an inline badge we render it at intrinsic size; for
// larger hero/empty-state surfaces we tile-stretch it.
export function WhatnotIcon({ size = 14, style }: { size?: number; style?: CSSProperties }) {
  return (
    <img
      src="/whatnot-logo.jpg"
      alt="Whatnot"
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(2, Math.round(size * 0.22)),
        objectFit: 'cover',
        display: 'inline-block',
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
