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

/**
 * Empty-state mark: the three artefacts a skill is made of, stacked as pages —
 * a source, the method derived from it, and the sealed receipt over both.
 *
 * Drawn as the product's own objects rather than as mascots. The previous
 * version used a yellow sticker, a green tick and a text star glyph outlined in
 * 2-3px black, which is off-palette for a wine brand, renders differently
 * depending on which font supplies the glyph, and reads as clip-art. Hairlines
 * and wine tints only: no black, no third hue, no rotation.
 */
export function StickerCluster() {
  return (
    <svg width="180" height="90" viewBox="0 0 180 90" aria-hidden="true" focusable="false">
      {/* Back page: the source. */}
      <rect
        x="14.5" y="18.5" width="72" height="54" rx="5"
        fill="var(--color-cherry-tint)" stroke="var(--color-accent)" strokeOpacity="0.35" strokeWidth="1"
      />
      <path d="M28 34h44M28 44h44M28 54h28" stroke="var(--color-accent)" strokeOpacity="0.4" strokeWidth="1.5" strokeLinecap="round" />

      {/* Middle page: the derived method, offset so the stack reads as depth. */}
      <rect
        x="52.5" y="26.5" width="72" height="54" rx="5"
        fill="var(--color-frost, #fff)" stroke="var(--color-accent)" strokeOpacity="0.45" strokeWidth="1"
      />
      <path d="M66 42h44M66 52h44M66 62h30" stroke="var(--color-accent)" strokeOpacity="0.55" strokeWidth="1.5" strokeLinecap="round" />

      {/* The seal: a human approval sitting over the method it approved. */}
      <circle cx="139" cy="52" r="19" fill="var(--color-accent)" />
      <path
        d="M131 52.5l5.5 5.5L148 46.5"
        fill="none" stroke="var(--color-cherry-tint)" strokeWidth="2.4"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}
