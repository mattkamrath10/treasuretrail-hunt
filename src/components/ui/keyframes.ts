const KEYFRAMES_ID = '__tt_ui_kf__';

export function ensureUiKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAMES_ID)) return;
  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  style.textContent = `
    @keyframes ttShimmer {
      0%   { background-position: -400px 0; }
      100% { background-position: 400px 0; }
    }
    @keyframes ttFadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes ttSpin {
      to { transform: rotate(360deg); }
    }
    @media (prefers-reduced-motion: reduce) {
      .tt-shimmer, .tt-fade { animation: none !important; transition: none !important; }
    }
    /* Horizontal scroll rows (Discover): hide native scrollbars while
       keeping wheel / touch / drag scrolling enabled. */
    .tt-hscroll { scrollbar-width: none; -ms-overflow-style: none; }
    .tt-hscroll::-webkit-scrollbar { width: 0; height: 0; display: none; }
  `;
  document.head.appendChild(style);
}
