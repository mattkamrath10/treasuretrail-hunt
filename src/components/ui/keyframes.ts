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
    @media (prefers-reduced-motion: reduce) {
      .tt-shimmer, .tt-fade { animation: none !important; transition: none !important; }
    }
  `;
  document.head.appendChild(style);
}
