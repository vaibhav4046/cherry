/** Signature inflatable ribbon motif, rendered as flat-fill SVG tube with a
 * highlight stroke. Decorative only — always aria-hidden. */
export function Ribbon({ color = 'var(--color-cherry-pop)', className = 'ribbon-svg' }: { color?: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 1200 400" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path
        d="M-60 320 C 200 80, 420 60, 620 200 S 1000 380, 1280 140"
        fill="none"
        stroke={color}
        strokeWidth="86"
        strokeLinecap="round"
      />
      <path
        d="M-60 320 C 200 80, 420 60, 620 200 S 1000 380, 1280 140"
        fill="none"
        stroke="#000"
        strokeWidth="90"
        strokeLinecap="round"
        strokeOpacity="0.9"
        style={{ strokeWidth: 90, fill: 'none' }}
        transform="translate(0 2)"
        opacity="0.12"
      />
      <path
        d="M-60 310 C 200 72, 420 52, 618 192 S 1000 370, 1280 132"
        fill="none"
        stroke="#fff"
        strokeWidth="14"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

/** Small decorative sticker shape cluster for empty states. */
export function StickerCluster() {
  return (
    <svg width="180" height="90" viewBox="0 0 180 90" aria-hidden="true" focusable="false">
      <g transform="rotate(-8 40 45)">
        <rect x="10" y="20" width="56" height="44" rx="14" fill="var(--color-sunburst)" stroke="#000" strokeWidth="2" />
        <text x="38" y="48" textAnchor="middle" fontFamily="var(--font-ui)" fontWeight="700" fontSize="20">★</text>
      </g>
      <g transform="rotate(6 110 40)">
        <circle cx="110" cy="40" r="24" fill="var(--color-cherry-pop)" stroke="#000" strokeWidth="2" />
        <path d="M110 24 c-3 -8 4 -12 8 -14" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" />
      </g>
      <g transform="rotate(-4 158 58)">
        <rect x="140" y="40" width="36" height="36" rx="12" fill="var(--color-mint-pop)" stroke="#000" strokeWidth="2" />
        <path d="M148 58 l6 7 12 -14" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
