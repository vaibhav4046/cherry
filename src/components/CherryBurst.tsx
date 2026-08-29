import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const SEEDS = [
  { x: -110, y: -70 },
  { x: 110, y: -80 },
  { x: -80, y: 60 },
  { x: 90, y: 70 },
  { x: 0, y: -110 },
  { x: -130, y: -5 },
  { x: 130, y: 10 },
  { x: 20, y: 100 },
];

/**
 * The hero cherry. Click it and it bursts — seeds fly outward and the split
 * transitions straight into the Studio shell. With reduced motion (or a second
 * click) it navigates immediately; the burst is decoration, never a gate.
 */
export function CherryBurst() {
  const navigate = useNavigate();
  const [bursting, setBursting] = useState(false);
  const firedRef = useRef(false);

  function go() {
    if (firedRef.current) return;
    firedRef.current = true;
    navigate('/studio');
  }

  function handleActivate() {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || bursting) {
      go();
      return;
    }
    setBursting(true);
    window.setTimeout(go, 620);
  }

  return (
    <button
      type="button"
      className={`cherry-hero-btn${bursting ? ' cherry-burst' : ''}`}
      onClick={handleActivate}
      aria-label="Open Cherry Studio"
      data-testid="cherry-burst"
    >
      <svg width="220" height="200" viewBox="0 0 220 200" aria-hidden="true" focusable="false">
        {/* Seeds fly out on burst; positions come from CSS custom properties. */}
        {SEEDS.map((seed, index) => (
          <circle
            key={index}
            className="cherry-seed"
            cx="110"
            cy="120"
            r="7"
            fill={index % 2 === 0 ? 'var(--color-cherry-pop)' : 'var(--color-maroon)'}
            stroke="#000"
            strokeWidth="2"
            style={{ ['--seed-x' as never]: `${seed.x}px`, ['--seed-y' as never]: `${seed.y}px` }}
          />
        ))}
        <g className="cherry-fruit">
          {/* Stem — the shape that echoes graph edges across the product. */}
          <path d="M118 18 C 96 34, 84 62, 86 92" fill="none" stroke="#000" strokeWidth="6" strokeLinecap="round" />
          <path d="M118 18 C 132 30, 138 48, 132 66" fill="none" stroke="#000" strokeWidth="6" strokeLinecap="round" />
          <path d="M118 18 c 14 -8 30 -6 38 4 c -12 6 -28 6 -38 -4 z" fill="var(--color-mint-pop)" stroke="#000" strokeWidth="4" />
          {/* Drupes */}
          <circle cx="82" cy="128" r="44" fill="var(--color-cherry-pop)" stroke="#000" strokeWidth="6" />
          <circle cx="140" cy="112" r="38" fill="var(--color-deep-cherry)" stroke="#000" strokeWidth="6" />
          <ellipse cx="68" cy="112" rx="12" ry="7" fill="#fff" opacity="0.65" transform="rotate(-28 68 112)" />
          <ellipse cx="128" cy="98" rx="9" ry="5" fill="#fff" opacity="0.5" transform="rotate(-24 128 98)" />
        </g>
      </svg>
      <span className="label" style={{ display: 'block', marginTop: 'var(--sp-2)' }}>
        {bursting ? 'Opening Studio…' : 'Tap the cherry'}
      </span>
    </button>
  );
}
