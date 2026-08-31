import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

interface CardRow {
  seconds: number;
  text: string;
}

interface CardData {
  lessonTitle: string;
  rows: CardRow[];
  skillName: string;
  revision: number;
  approved: boolean;
  verified: boolean;
  receiptHash: string | null;
}

function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/**
 * The product in miniature: real data from the labelled example export —
 * a source, timestamped evidence, a skill, a human approval, a verified run.
 */
function LessonCard() {
  const [card, setCard] = useState<CardData | null | 'unavailable'>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/examples/example-workspace.json');
        if (!response.ok) throw new Error('example unavailable');
        const data = (await response.json()) as {
          lessons: Array<{ id: string; title: string }>;
          observations: Array<{ timestampSeconds: number; text: string }>;
          transcriptSegments: Array<{ startSeconds?: number; timestampSeconds?: number; text: string }>;
          skillGraphs: Array<{ name: string; revision: number; status: string; approvedRevision: number | null }>;
          verifications: Array<{ status: string }>;
          proofReceipts: Array<{ receiptHash: string }>;
        };
        const rows: CardRow[] = data.observations
          .slice(0, 3)
          .map((observation) => ({ seconds: observation.timestampSeconds, text: observation.text }));
        for (const segment of data.transcriptSegments) {
          if (rows.length >= 3) break;
          rows.push({ seconds: segment.startSeconds ?? segment.timestampSeconds ?? 0, text: segment.text });
        }
        const skill = data.skillGraphs[0];
        if (!cancelled && skill) {
          setCard({
            lessonTitle: data.lessons[0]?.title ?? 'Lesson',
            rows,
            skillName: skill.name,
            revision: skill.revision,
            approved: skill.status === 'approved' && skill.approvedRevision === skill.revision,
            verified: data.verifications.some((report) => report.status === 'passed'),
            receiptHash: data.proofReceipts[0]?.receiptHash?.slice(0, 12) ?? null,
          });
        }
      } catch {
        if (!cancelled) setCard('unavailable');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (card === 'unavailable') {
    return (
      <div className="lesson-card" aria-hidden="true">
        <p className="label" style={{ margin: 0 }}>The example lesson could not load. The Studio still works — everything is local.</p>
      </div>
    );
  }

  return (
    <Link to="/studio?demo=1" className="lesson-card" data-testid="lesson-card" aria-label="Open the guided example in the Studio">
      <p className="label" style={{ margin: 0 }}>Lesson</p>
      <p style={{ margin: '2px 0 var(--sp-3)', fontWeight: 600 }}>{card ? card.lessonTitle : 'Loading the example…'}</p>
      {card
        ? card.rows.map((row) => (
            <span className="obs-row" key={`${row.seconds}-${row.text.slice(0, 12)}`}>
              <span className="obs-time tnum">{formatTimestamp(row.seconds)}</span>
              <span>{row.text}</span>
            </span>
          ))
        : null}
      {card ? (
        <div className="stack" style={{ gap: 'var(--sp-2)', marginTop: 'var(--sp-3)' }}>
          <p style={{ margin: 0 }}>
            <span className="label">Skill draft · </span>
            {card.skillName} <span className="label tnum">revision {card.revision}</span>
          </p>
          <p style={{ margin: 0 }}>
            <span className={card.approved ? 'sticker sticker-pass' : 'sticker sticker-wait'}>
              {card.approved ? `Approved · revision ${card.revision}` : 'Waiting for your approval'}
            </span>{' '}
            <span className={card.verified ? 'sticker sticker-pass' : 'sticker'}>
              {card.verified ? 'Verified' : 'Not verified yet'}
            </span>
          </p>
          {card.receiptHash ? (
            <p className="label tnum" style={{ margin: 0 }}>Receipt {card.receiptHash}… — recompute it yourself</p>
          ) : null}
        </div>
      ) : null}
    </Link>
  );
}

export function Landing() {
  return (
    <div>
      <header>
        <nav className="top-nav" aria-label="Main navigation">
          <Link to="/" className="logo-mark" aria-label="Cherry home">C</Link>
          <div className="row nav-links" style={{ flex: 1, justifyContent: 'center' }}>
            <a href="#how" className="nav-pill">How it works</a>
            <Link to="/showcase" className="nav-pill">Showcase</Link>
            <Link to="/compatibility" className="nav-pill">What's proven</Link>
          </div>
          <Link to="/studio" className="btn btn-primary">Open Studio</Link>
        </nav>
      </header>

      <main>
        <section className="home-hero page-enter" aria-labelledby="hero-heading">
          <div className="stack" style={{ gap: 'var(--sp-4)' }}>
            <p className="home-eyebrow" style={{ margin: 0 }}>Cherry / Skill studio</p>
            <h1 id="hero-heading" className="home-headline">Turn a lesson into a skill you can run.</h1>
            <p className="subhead" style={{ margin: 0, maxWidth: 480 }}>
              Give Cherry a lesson you're allowed to learn from. It drafts the method with timestamped
              evidence, waits for your approval, then verifies the result — and seals it with a receipt
              anyone can recompute.
            </p>
            <div className="row" data-testid="hero-ctas" style={{ marginTop: 'var(--sp-2)' }}>
              <Link to="/studio?demo=1" className="btn btn-primary">Try the guided example</Link>
              <Link to="/studio" className="link-quiet">Open Studio</Link>
            </div>
            <p className="trust-line" style={{ margin: 0 }}>Local-first · Human-approved · Proof-backed</p>
          </div>
          <LessonCard />
        </section>

        <section id="how" className="home-three" aria-label="How Cherry works">
          <div>
            <p className="num label">01</p>
            <h2>Learn from the source</h2>
            <p>
              Every step is drawn from timestamped evidence — what was said, what was shown, and when.
              Anything from outside starts untrusted until you promote it.
            </p>
          </div>
          <div>
            <p className="num label">02</p>
            <h2>Approve the method</h2>
            <p>
              The skill is a readable contract, not a black box. You approve the exact revision you
              read — edit anything afterwards and the approval goes stale.
            </p>
          </div>
          <div>
            <p className="num label">03</p>
            <h2>Run it with proof</h2>
            <p>
              Verification runs real checks that can genuinely fail. The pass, the failures, and the
              repairs are sealed into an exportable receipt.
            </p>
            <picture>
              <source srcSet="/media/cherry-editorial/cherry-seal-mark.webp" type="image/webp" />
              <img
                src="/media/cherry-editorial/cherry-seal-mark.png"
                alt=""
                aria-hidden="true"
                width={56}
                height={56}
                loading="lazy"
                decoding="async"
                style={{ marginTop: 'var(--sp-3)' }}
              />
            </picture>
          </div>
        </section>
      </main>

      <footer className="band band-cream">
        <div className="band-inner row" style={{ justifyContent: 'space-between' }}>
          <span className="label">Cherry — the apprenticeship layer for AI agents</span>
          <span className="label">
            MIT licensed · local-first · WebMCP Challenge 2026 ·{' '}
            <a href="/lab/cherry-3d/" className="link-quiet">Brand lab (3D)</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
