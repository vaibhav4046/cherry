import { useEffect, useRef, useState } from 'react';

const SEED_DESKTOP = '/media/cherry-chronicle/artifacts/seed-outcome-desktop.svg';
const SEED_MOBILE = '/media/cherry-chronicle/artifacts/seed-outcome-mobile.svg';

export function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return reducedMotion;
}

function MissionStill() {
  return (
    <picture className="mission-film__still" data-testid="mission-film-still">
      <source media="(max-width: 767px)" srcSet={SEED_MOBILE} />
      <img
        src={SEED_DESKTOP}
        alt="A historic cherry study overlaid with a seed opening into a two-branch mission graph."
      />
    </picture>
  );
}

export function MissionFilm({ reducedMotion }: { reducedMotion: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playback, setPlayback] = useState<'paused' | 'playing' | 'error'>('paused');

  if (reducedMotion) return <MissionStill />;

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (playback === 'playing') {
      video.pause();
      return;
    }
    try {
      await video.play();
    } catch {
      setPlayback('error');
    }
  }

  return (
    <div className="mission-film">
      <video
        ref={videoRef}
        className="mission-film__video"
        src="/media/cherry-demo/mission-hero.webm"
        poster={SEED_DESKTOP}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="Silent mission film"
        onPlay={() => setPlayback('playing')}
        onPause={() => setPlayback('paused')}
        onEnded={() => setPlayback('paused')}
        onError={() => setPlayback('error')}
      />
      <button type="button" className="mission-film__control" onClick={() => void togglePlayback()}>
        {playback === 'playing' ? 'Pause film' : playback === 'error' ? 'Retry film' : 'Play film'}
      </button>
      {playback === 'error' ? (
        <p className="mission-film__error" role="status" aria-live="polite">
          The mission film could not play.
        </p>
      ) : null}
    </div>
  );
}

export function MissionCaptureStage() {
  return (
    <main className="mission-capture" data-testid="mission-capture-ready" aria-label="Mission film capture stage">
      <div className="mission-capture__paper" aria-hidden="true">
        <img src={SEED_DESKTOP} alt="" />
        <div className="mission-capture__seed" />
        <div className="mission-capture__trunk" />
        <div className="mission-capture__branch mission-capture__branch--one" />
        <div className="mission-capture__branch mission-capture__branch--two" />
        <div className="mission-capture__worker mission-capture__worker--one"><span>✓</span></div>
        <div className="mission-capture__worker mission-capture__worker--two"><span>✓</span></div>
        <div className="mission-capture__proof"><span>✓</span></div>
        <div className="mission-capture__human" />
        <div className="mission-capture__scan" />
      </div>
    </main>
  );
}
