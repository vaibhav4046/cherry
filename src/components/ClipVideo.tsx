import { useEffect, useRef, useState } from 'react';

interface ClipVideoProps {
  src: string;
  /** Presentation: 'card' (framed illustration) or 'bg' (absolute cover layer). */
  variant?: 'card' | 'bg';
  /** First-frame image: instant paint before the clip loads, and the motion-free
   * fallback under prefers-reduced-motion. Without one, reduced motion renders nothing. */
  poster?: string;
  className?: string;
}

/**
 * Decorative brand clip (generated illustration — never product proof).
 * Muted, looped, aria-hidden; loads and plays only when scrolled into view,
 * pauses off-screen. Under prefers-reduced-motion it shows the static poster
 * when one is provided, otherwise renders nothing.
 */
export function ClipVideo({ src, variant = 'card', poster, className }: ClipVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [reducedMotion] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (reducedMotion) return;
    const video = videoRef.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void video.play().catch(() => {
              /* Autoplay refusal is fine — the poster background remains. */
            });
          } else {
            video.pause();
          }
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [reducedMotion]);

  const clipClass = `${variant === 'bg' ? 'clip-bg' : 'clip-card'}${className ? ` ${className}` : ''}`;

  if (reducedMotion) {
    if (!poster) return null;
    return <img className={clipClass} src={poster} alt="" aria-hidden="true" loading="lazy" decoding="async" />;
  }

  return (
    <video
      ref={videoRef}
      className={clipClass}
      src={src}
      poster={poster}
      muted
      autoPlay
      loop
      playsInline
      preload="metadata"
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}
