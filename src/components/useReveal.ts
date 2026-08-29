import { useEffect } from 'react';

/**
 * Scroll-depth reveals: elements with the `reveal` class fade/slide in when
 * they enter the viewport. IntersectionObserver only — no scroll handlers.
 * Under prefers-reduced-motion the CSS shows everything immediately.
 */
export function useReveal(): void {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const elements = Array.from(document.querySelectorAll<HTMLElement>('.reveal'));
    if (elements.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal-in');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, []);
}
