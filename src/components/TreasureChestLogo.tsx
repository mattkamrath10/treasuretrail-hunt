export function TreasureChestLogo({ size = 40, glow = false }: { size?: number; glow?: boolean }) {
  return (
    <div style={{
      width: size,
      height: size,
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {glow && (
        <div style={{
          position: 'absolute',
          inset: '-4px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(234, 179, 8, 0.3) 0%, transparent 70%)',
          animation: 'chestGlow 2s ease-in-out infinite',
        }} />
      )}
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Chest body */}
        <rect x="8" y="22" width="32" height="18" rx="3" fill="url(#chestGradient)" />
        <rect x="8" y="22" width="32" height="18" rx="3" stroke="#A16207" strokeWidth="1.5" />

        {/* Chest band */}
        <rect x="8" y="28" width="32" height="4" fill="#854D0E" opacity="0.3" />

        {/* Lid - slightly open */}
        <path
          d="M10 22C10 22 10 14 24 14C38 14 38 22 38 22"
          fill="url(#lidGradient)"
          stroke="#A16207"
          strokeWidth="1.5"
        />
        <path
          d="M7 23L10 18C10 18 12 12 24 12C36 12 38 18 38 18L41 23"
          fill="url(#lidGradient)"
          stroke="#A16207"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Lock plate */}
        <rect x="20" y="28" width="8" height="8" rx="2" fill="#CA8A04" />
        <circle cx="24" cy="32" r="2" fill="#FDE047" />

        {/* Glow from inside */}
        <path
          d="M12 22C12 22 16 20 24 20C32 20 36 22 36 22"
          stroke="#FDE047"
          strokeWidth="1"
          opacity="0.6"
        />

        <defs>
          <linearGradient id="chestGradient" x1="8" y1="22" x2="8" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#CA8A04" />
            <stop offset="1" stopColor="#854D0E" />
          </linearGradient>
          <linearGradient id="lidGradient" x1="24" y1="12" x2="24" y2="23" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#EAB308" />
            <stop offset="1" stopColor="#CA8A04" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

export function TreasureChestBrand({ variant = 'full' }: { variant?: 'full' | 'icon' }) {
  if (variant === 'icon') {
    return <TreasureChestLogo size={28} />;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <TreasureChestLogo size={28} />
      <span style={{
        fontSize: 'var(--font-size-lg)',
        fontWeight: 'var(--font-weight-bold)',
        color: 'var(--color-neutral-900)',
        letterSpacing: '-0.5px',
      }}>
        TreasureTrail Marketplace
      </span>
    </div>
  );
}
