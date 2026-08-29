interface CherryMascotProps {
  pose?: 'present' | 'point' | 'wave' | 'stamp';
  size?: number;
  /** What the mascot says. Rendered as a real speech bubble, readable by AT. */
  line?: string;
  flip?: boolean;
}

/**
 * The Cherry mascot: a cherry-headed sticker-book figure that walks the reader
 * through the product. Pure SVG, 1px-outline sticker language, no dependencies.
 * Decorative body is aria-hidden; the speech line is real text.
 */
export function CherryMascot({ pose = 'present', size = 180, line, flip = false }: CherryMascotProps) {
  const arms: Record<string, { left: string; right: string; extra?: React.ReactNode }> = {
    // Arms drawn from shoulder (100,150) outward.
    present: {
      left: 'M86 152 C 62 158, 46 148, 38 132',
      right: 'M114 152 C 138 158, 154 148, 162 132',
      extra: (
        <g>
          <circle cx="38" cy="124" r="9" fill="var(--color-sunburst)" stroke="#000" strokeWidth="3" />
          <circle cx="162" cy="124" r="9" fill="var(--color-mint-pop)" stroke="#000" strokeWidth="3" />
        </g>
      ),
    },
    point: {
      left: 'M86 152 C 70 168, 62 180, 58 192',
      right: 'M114 152 C 142 140, 158 124, 168 104',
      extra: <circle cx="170" cy="100" r="5" fill="var(--color-cherry-pop)" stroke="#000" strokeWidth="3" />,
    },
    wave: {
      left: 'M86 152 C 70 168, 62 180, 58 192',
      right: 'M114 152 C 136 132, 144 112, 142 92',
      extra: (
        <g stroke="#000" strokeWidth="2.5" strokeLinecap="round" opacity="0.85">
          <path d="M150 84 c 6 -4 10 -10 12 -16" fill="none" />
          <path d="M156 96 c 8 -2 14 -6 18 -12" fill="none" />
        </g>
      ),
    },
    stamp: {
      left: 'M86 152 C 66 150, 52 158, 44 170',
      right: 'M114 152 C 134 150, 148 158, 156 170',
      extra: (
        <g transform="rotate(-8 100 196)">
          <rect x="78" y="184" width="44" height="22" rx="8" fill="var(--color-mint-pop)" stroke="#000" strokeWidth="3" />
          <path d="M88 195 l7 7 14 -13" fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ),
    },
  };

  const arm = arms[pose]!;

  return (
    <figure style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 8, margin: 0 }} data-testid="cherry-mascot">
      <svg
        width={size}
        height={Math.round(size * 1.28)}
        viewBox="0 0 200 256"
        aria-hidden="true"
        focusable="false"
        style={flip ? { transform: 'scaleX(-1)' } : undefined}
      >
        {/* stem + leaf */}
        <path d="M104 8 C 96 24, 94 38, 98 52" fill="none" stroke="#000" strokeWidth="5" strokeLinecap="round" />
        <path d="M104 8 c 12 -6 26 -4 32 4 c -10 6 -24 5 -32 -4 z" fill="var(--color-mint-pop)" stroke="#000" strokeWidth="3.5" />
        {/* cherry head */}
        <circle cx="100" cy="96" r="48" fill="var(--color-cherry-pop)" stroke="#000" strokeWidth="5" />
        <ellipse cx="82" cy="80" rx="12" ry="7" fill="#fff" opacity="0.6" transform="rotate(-25 82 80)" />
        {/* face */}
        <circle cx="86" cy="94" r="4.5" fill="#000" />
        <circle cx="114" cy="94" r="4.5" fill="#000" />
        <path d="M88 112 q 12 10 24 0" fill="none" stroke="#000" strokeWidth="4" strokeLinecap="round" />
        <circle cx="74" cy="106" r="6" fill="var(--color-blush)" opacity="0.9" />
        <circle cx="126" cy="106" r="6" fill="var(--color-blush)" opacity="0.9" />
        {/* body */}
        <path d="M100 144 L 100 196" stroke="#000" strokeWidth="6" strokeLinecap="round" />
        {/* arms */}
        <path d={arm.left} fill="none" stroke="#000" strokeWidth="6" strokeLinecap="round" />
        <path d={arm.right} fill="none" stroke="#000" strokeWidth="6" strokeLinecap="round" />
        {/* legs */}
        <path d="M100 196 C 90 212, 84 228, 82 242" fill="none" stroke="#000" strokeWidth="6" strokeLinecap="round" />
        <path d="M100 196 C 110 212, 116 228, 118 242" fill="none" stroke="#000" strokeWidth="6" strokeLinecap="round" />
        {/* feet */}
        <ellipse cx="76" cy="245" rx="12" ry="6" fill="#000" />
        <ellipse cx="124" cy="245" rx="12" ry="6" fill="#000" />
        {arm.extra}
      </svg>
      {line ? (
        <figcaption
          className="mascot-bubble"
          style={{
            background: 'var(--color-paper-white)',
            color: 'var(--color-carbon)',
            border: 'var(--border)',
            borderRadius: 'var(--radius-sticker)',
            padding: '8px 14px',
            fontSize: 13,
            fontWeight: 700,
            maxWidth: 260,
            textAlign: 'center',
          }}
        >
          {line}
        </figcaption>
      ) : null}
    </figure>
  );
}
