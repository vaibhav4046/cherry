import type { ReactNode } from 'react';
import type { LandingSectionCopy } from './landing-content.ts';

interface PlateProps {
  /** Editorial plate id from public/media/cherry-editorial (Cherry-origin only). */
  plate: 'teach' | 'proof' | 'connect' | 'carry' | 'hero';
}

const PLATE_FILES: Record<PlateProps['plate'], { base: string; width: number; height: number }> = {
  hero: { base: 'cherry-hero-engraving', width: 1536, height: 1024 },
  teach: { base: 'cherry-teach-plate', width: 1619, height: 971 },
  proof: { base: 'cherry-proof-receipt', width: 1619, height: 971 },
  connect: { base: 'cherry-connect-bridge', width: 1619, height: 971 },
  carry: { base: 'cherry-carry-bundle', width: 1619, height: 971 },
};

/** Decorative Cherry editorial plate: AVIF and WebP only, sized, lazy, alt empty. */
export function EditorialPlate({ plate }: PlateProps) {
  const file = PLATE_FILES[plate];
  return (
    <picture className="gm-plate">
      <source srcSet={`/media/cherry-editorial/${file.base}.avif`} type="image/avif" />
      <source srcSet={`/media/cherry-editorial/${file.base}.webp`} type="image/webp" />
      <img
        src={`/media/cherry-editorial/${file.base}.webp`}
        alt=""
        aria-hidden="true"
        width={file.width}
        height={file.height}
        loading="lazy"
        decoding="async"
      />
    </picture>
  );
}

interface LandingSectionProps {
  copy: LandingSectionCopy;
  children?: ReactNode;
  /** Put the demonstration before the copy on wide screens. */
  flip?: boolean;
  wide?: boolean;
}

/**
 * One landing chapter: numbered kicker, heading, body, and a demonstration
 * column. Uses only existing tokens; the layout rules live in landing.css.
 */
export function LandingSection({ copy, children, flip = false, wide = false }: LandingSectionProps) {
  const headingId = `${copy.id}-heading`;
  return (
    <section id={copy.id} className={`gm-section${flip ? ' gm-flip' : ''}${wide ? ' gm-wide' : ''}`} aria-labelledby={headingId}>
      <div className="gm-copy">
        <p className="gm-num label">
          <span className="tnum">{copy.number}</span> / {copy.kicker}
        </p>
        <h2 id={headingId} className="gm-heading">{copy.heading}</h2>
        <p className="gm-body">{copy.body}</p>
      </div>
      {children ? <div className="gm-demo">{children}</div> : null}
    </section>
  );
}
