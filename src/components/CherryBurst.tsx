import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const SEEDS = [
  { x: -170, y: -110 },
  { x: 170, y: -125 },
  { x: -125, y: 95 },
  { x: 140, y: 110 },
  { x: 0, y: -175 },
  { x: -205, y: -8 },
  { x: 205, y: 16 },
  { x: 32, y: 160 },
];

/**
 * The hero cherry: the glossy split-cherry with the robot core (the brand-board
 * mascot). Click it and it bursts — seeds fly outward and the split transitions
 * straight into the Studio shell. With reduced motion (or a second click) it
 * navigates immediately; the burst is decoration, never a gate.
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
      <svg width="360" height="360" viewBox="0 0 600 600" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id="gc-halfL" cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#ff8fae" />
            <stop offset="55%" stopColor="#e02350" />
            <stop offset="100%" stopColor="#7e1330" />
          </radialGradient>
          <radialGradient id="gc-halfR" cx="40%" cy="28%" r="80%">
            <stop offset="0%" stopColor="#ff6d92" />
            <stop offset="55%" stopColor="#b01840" />
            <stop offset="100%" stopColor="#5c0f26" />
          </radialGradient>
          <radialGradient id="gc-core" cx="38%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#3a3a46" />
            <stop offset="55%" stopColor="#17171f" />
            <stop offset="100%" stopColor="#0a0a10" />
          </radialGradient>
          <linearGradient id="gc-stem" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8fd05a" />
            <stop offset="100%" stopColor="#3d7d33" />
          </linearGradient>
          <filter id="gc-soft" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <filter id="gc-soft2" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        {/* Seeds fly out on burst; positions come from CSS custom properties. */}
        {SEEDS.map((seed, index) => (
          <circle
            key={index}
            className="cherry-seed"
            cx="300"
            cy="380"
            r="11"
            fill={index % 2 === 0 ? '#ff4f78' : '#ffdfe9'}
            stroke="#2a0a12"
            strokeWidth="2"
            style={{ ['--seed-x' as never]: `${seed.x}px`, ['--seed-y' as never]: `${seed.y}px` }}
          />
        ))}

        <ellipse cx="300" cy="330" rx="230" ry="200" fill="#ff4f78" opacity="0.22" filter="url(#gc-soft)" />

        <g className="cherry-fruit">
          {/* Splash arcs and sparks */}
          <g opacity="0.85">
            <path d="M92,330 C 60,260 96,180 170,150 C 130,210 122,270 148,330 Z" fill="#ff6d92" opacity="0.5" filter="url(#gc-soft2)" />
            <path d="M508,340 C 546,270 512,186 436,154 C 478,214 486,276 458,336 Z" fill="#ff6d92" opacity="0.5" filter="url(#gc-soft2)" />
            <circle cx="120" cy="420" r="10" fill="#ff8fae" opacity="0.8" />
            <circle cx="486" cy="428" r="7" fill="#ff8fae" opacity="0.7" />
            <circle cx="150" cy="170" r="6" fill="#ffdfe9" opacity="0.8" />
            <circle cx="462" cy="182" r="9" fill="#ffdfe9" opacity="0.6" />
            <circle cx="520" cy="300" r="5" fill="#ff4f78" opacity="0.9" />
            <circle cx="84" cy="284" r="5" fill="#ff4f78" opacity="0.9" />
          </g>

          {/* Stem + leaf */}
          <path d="M300,96 C 282,148 276,196 286,238" fill="none" stroke="url(#gc-stem)" strokeWidth="16" strokeLinecap="round" />
          <path d="M300,96 c 30,-22 74,-20 96,4 c -26,20 -70,18 -96,-4 z" fill="url(#gc-stem)" />
          <path d="M310,102 c 24,-14 56,-13 74,2" fill="none" stroke="#d7f0c2" strokeWidth="4" strokeLinecap="round" opacity="0.7" />

          {/* Split cherry halves */}
          <path d="M282,246 C 170,246 96,332 104,418 C 110,494 178,542 258,534 C 292,530 314,514 320,488 L 320,300 C 320,268 308,246 282,246 Z" fill="url(#gc-halfL)" />
          <path d="M318,246 C 430,246 504,332 496,418 C 490,494 422,542 342,534 C 308,530 286,514 280,488 L 280,300 C 280,268 292,246 318,246 Z" fill="url(#gc-halfR)" />
          <ellipse cx="188" cy="322" rx="52" ry="30" fill="#ffffff" opacity="0.5" transform="rotate(-24 188 322)" />
          <ellipse cx="416" cy="316" rx="40" ry="22" fill="#ffffff" opacity="0.35" transform="rotate(22 416 316)" />
          <path d="M292,262 L 292,520" stroke="#ffb9cd" strokeWidth="5" opacity="0.55" />
          <path d="M308,262 L 308,520" stroke="#7e1330" strokeWidth="5" opacity="0.55" />

          {/* Robot core */}
          <g style={{ filter: 'drop-shadow(0 0 26px rgba(255, 79, 120, 0.65))' }}>
            <circle cx="300" cy="398" r="104" fill="url(#gc-core)" />
            <circle cx="300" cy="398" r="104" fill="none" stroke="#ff9db8" strokeWidth="3" opacity="0.55" />
            <ellipse cx="262" cy="352" rx="40" ry="22" fill="#ffffff" opacity="0.28" transform="rotate(-24 262 352)" />
            <rect x="248" y="376" width="34" height="46" rx="17" fill="#ffffff" />
            <rect x="318" y="376" width="34" height="46" rx="17" fill="#ffffff" />
            <rect x="248" y="376" width="34" height="46" rx="17" fill="none" stroke="#ff9db8" strokeWidth="2" opacity="0.7" />
            <rect x="318" y="376" width="34" height="46" rx="17" fill="none" stroke="#ff9db8" strokeWidth="2" opacity="0.7" />
            <path d="M276,452 q 24,16 48,0" fill="none" stroke="#ff9db8" strokeWidth="5" strokeLinecap="round" opacity="0.8" />
          </g>
        </g>

        <ellipse cx="300" cy="560" rx="170" ry="20" fill="#ff4f78" opacity="0.25" filter="url(#gc-soft2)" />
      </svg>
      <span className="label" style={{ display: 'block', marginTop: 'var(--sp-2)', color: 'var(--color-cream)' }}>
        {bursting ? 'Opening Studio…' : 'Tap the cherry'}
      </span>
    </button>
  );
}
