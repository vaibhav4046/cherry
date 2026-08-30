import { useEffect, useRef, useState } from 'react';

interface ClipVideoProps {
  src: string;
  /** Presentation: 'card' (framed illustration) or 'bg' (absolute cover layer). */
  variant?: 'card' | 'bg';
  className?: string;
}

/**
 * Decorative brand clip (generated illustration — never product proof).
 * Muted, looped, aria-hidden; loads and plays only when scrolled into view,
 * pauses off-screen, and renders nothing at all under prefers-reduced-motion.
 */
export function ClipVideo({ src, variant = 'card', className }: ClipVideoProps) {
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

  if (reducedMotion) return null;

  return (
    <video
      ref={videoRef}
      className={`${variant === 'bg' ? 'clip-bg' : 'clip-card'}${className ? ` ${className}` : ''}`}
      src={src}
      muted
      loop
      playsInline
      preload="metadata"
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}
