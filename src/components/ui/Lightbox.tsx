import { Component, useEffect, type CSSProperties, type ReactNode } from 'react';

const MAX_DATA_URI_BYTES = 1_500_000;

type LightboxProps = {
  src: string | null | undefined;
  alt: string;
  open: boolean;
  onClose: () => void;
  onUnrenderable?: (reason: string) => void;
};

export function Lightbox({ src, alt, open, onClose, onUnrenderable }: LightboxProps) {
  useEffect(() => {
    if (!open) return;
    const meta = describeSrc(src);
    console.log('[LIGHTBOX] open', meta);
    if (meta.skip) {
      console.warn('[LIGHTBOX] skip render —', meta.skipReason, meta);
      onUnrenderable?.(meta.skipReason ?? 'Image cannot be displayed.');
      onClose();
    }
  }, [open, src, onClose, onUnrenderable]);

  if (!open || !src) return null;
  const meta = describeSrc(src);
  if (meta.skip) return null;

  return (
    <LightboxErrorBoundary
      onError={(err) => {
        console.error('[LIGHTBOX] render error — closing', err);
        onUnrenderable?.('Image failed to display.');
        onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={alt} onClick={onClose} style={styles.backdrop}>
        <img
          src={src}
          alt={alt}
          style={styles.img}
          onError={() => {
            console.error('[LIGHTBOX] <img> onError', describeSrc(src));
            onUnrenderable?.('Image failed to load.');
            onClose();
          }}
          onLoad={() => console.log('[LIGHTBOX] <img> onLoad ok')}
        />
      </div>
    </LightboxErrorBoundary>
  );
}

function describeSrc(src: string | null | undefined) {
  if (!src) return { skip: true, skipReason: 'No image to display.', isDataUri: false, length: 0, prefix: '' };
  const isDataUri = src.startsWith('data:');
  const length = src.length;
  const prefix = src.slice(0, 48);
  if (isDataUri && length > MAX_DATA_URI_BYTES) {
    return {
      skip: true,
      skipReason: "This image is too large to zoom on mobile. The owner should re-upload to fix.",
      isDataUri, length, prefix,
    };
  }
  return { skip: false, isDataUri, length, prefix };
}

class LightboxErrorBoundary extends Component<{ children: ReactNode; onError: (err: Error) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: Error) { this.props.onError(err); }
  render() { return this.state.failed ? null : this.props.children; }
}

const styles: Record<string, CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.92)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: 16, cursor: 'zoom-out',
  },
  img: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' },
};
