/**
 * Sticker-book flow & architecture diagrams. Pure SVG in the product's
 * 1px-outline language: pill nodes, pastel fills, connectors that draw
 * themselves in on scroll (stroke-dash under `.reveal-in`). Every box states
 * something the product actually does — no invented components.
 */

const INK = '#000';
const FONT = "'Inter', ui-sans-serif, system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

interface PillNodeProps {
  x: number;
  y: number;
  w: number;
  h?: number;
  fill: string;
  label: string;
  sub?: string;
  strokeWidth?: number;
}

function PillNode({ x, y, w, h = 72, fill, label, sub, strokeWidth = 2 }: PillNodeProps) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={20} fill={fill} stroke={INK} strokeWidth={strokeWidth} />
      <text x={x + w / 2} y={y + (sub ? h / 2 - 4 : h / 2 + 6)} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={16} fill={INK}>
        {label}
      </text>
      {sub ? (
        <text x={x + w / 2} y={y + h / 2 + 18} textAnchor="middle" fontFamily={FONT} fontWeight={600} fontSize={12} fill="#3a3a3a">
          {sub}
        </text>
      ) : null}
    </g>
  );
}

/** Horizontal connector with a solid tip. The shaft draws in on reveal. */
function HArrow({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  return (
    <g>
      <path className="draw" d={`M${x1},${y} L${x2 - 12},${y}`} fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      <path d={`M${x2},${y} l-13,-7 v14 z`} fill={INK} />
    </g>
  );
}

/** Curved connector ending horizontally, with a solid tip. */
function CurveArrow({ d, tipX, tipY }: { d: string; tipX: number; tipY: number }) {
  return (
    <g>
      <path className="draw" d={d} fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      <path d={`M${tipX},${tipY} l-13,-7 v14 z`} fill={INK} />
    </g>
  );
}

/** #1 TEACH — any lesson becomes an approved, versioned skill. */
export function TeachFlow() {
  return (
    <svg viewBox="0 0 1100 210" role="img" aria-label="Flow: any lesson becomes a timestamped transcript, then editable draft steps, then passes the human approval gate at an exact revision, and comes out as a versioned skill.">
      <PillNode x={20} y={70} w={180} fill="var(--color-sky-wash)" label="Any lesson" sub="video · doc · pasted text" />
      <HArrow x1={205} y={106} x2={248} />
      <PillNode x={250} y={70} w={190} fill="var(--color-lavender)" label="Transcript" sub="timestamped evidence" />
      <HArrow x1={445} y={106} x2={488} />
      <PillNode x={490} y={70} w={180} fill="#e2f8ee" label="Draft steps" sub="derived · editable" />
      <HArrow x1={675} y={106} x2={718} />
      <text x={798} y={52} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={11} letterSpacing={2} fill={INK}>HUMAN GATE</text>
      <PillNode x={720} y={70} w={156} fill="var(--color-sunburst)" label="You approve" sub="exact revision" strokeWidth={3} />
      <HArrow x1={881} y={106} x2={924} />
      <PillNode x={926} y={70} w={154} fill="var(--color-cherry-wash)" label="Skill v0.1.0" sub="versioned · portable" />
    </svg>
  );
}

/** #2 PROVE — the receipt pipeline, recomputable by anyone. */
export function ProofFlow() {
  return (
    <svg viewBox="0 0 1100 255" role="img" aria-label="Flow: every action lands in an append-only event ledger, is serialised as canonical JSON per RFC 8785, hashed with SHA-256, and sealed into a receipt that anyone can recompute — and it must match.">
      <PillNode x={20} y={50} w={170} fill="var(--color-cream)" label="Every action" sub="edits · approvals · runs" />
      <HArrow x1={195} y={86} x2={238} />
      <PillNode x={240} y={50} w={190} fill="var(--color-sky-wash)" label="Event ledger" sub="append-only" />
      <HArrow x1={435} y={86} x2={478} />
      <PillNode x={480} y={50} w={210} fill="var(--color-lavender)" label="Canonical JSON" sub="RFC 8785" />
      <HArrow x1={695} y={86} x2={738} />
      <PillNode x={740} y={50} w={140} fill="var(--color-sunburst)" label="SHA-256" sub="content hash" />
      <HArrow x1={885} y={86} x2={928} />
      <PillNode x={930} y={50} w={150} fill="var(--color-cherry-wash)" label="Receipt" sub="recomputable" />
      <path d="M1005,126 C 1005,205 340,205 336,132" fill="none" stroke={INK} strokeWidth={2.5} strokeDasharray="7 7" strokeLinecap="round" />
      <path d="M336,124 l-7,13 h14 z" fill={INK} />
      <text x={670} y={228} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={13} fill={INK}>
        anyone can recompute the hashes — they must match
      </text>
    </svg>
  );
}

/** #3 CONNECT — the WebMCP architecture with the human-only gate. */
export function ConnectArch() {
  const slotX = [50, 118, 186, 254, 322];
  return (
    <svg viewBox="0 0 1100 400" role="img" aria-label="Architecture: your browser tab runs Cherry Wine locally and exposes at most five state-aware tools; your own Claude or ChatGPT subscription connects over WebMCP to read state, call tools, and watch the lesson with you. Approvals, trust, and memory stay human-only — no tool can cross that gate.">
      {/* Browser tab */}
      <rect x={20} y={30} width={430} height={250} rx={24} fill="var(--color-cream)" stroke={INK} strokeWidth={2.5} />
      <text x={235} y={64} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={17} fill={INK}>YOUR BROWSER TAB</text>
      <text x={235} y={84} textAnchor="middle" fontFamily={FONT} fontWeight={600} fontSize={12} fill="#3a3a3a">Cherry Wine — local-first, no cloud</text>
      <rect x={50} y={104} width={180} height={46} rx={14} fill="var(--color-blush)" stroke={INK} strokeWidth={2} />
      <text x={140} y={132} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={14} fill={INK}>Mission state</text>
      {slotX.map((x, index) => (
        <g key={index}>
          <rect x={x} y={172} width={56} height={44} rx={10} fill="var(--color-sky-wash)" stroke={INK} strokeWidth={2} />
          <text x={x + 28} y={199} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={12} fill={INK}>{`T${index + 1}`}</text>
        </g>
      ))}
      <text x={50} y={248} fontFamily={FONT} fontWeight={600} fontSize={12} fill="#3a3a3a">5 tools at a time · state-aware aperture</text>

      {/* Agent host */}
      <rect x={650} y={30} width={430} height={250} rx={24} fill="var(--color-sky-wash)" stroke={INK} strokeWidth={2.5} />
      <text x={865} y={64} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={17} fill={INK}>YOUR AGENT</text>
      <text x={865} y={84} textAnchor="middle" fontFamily={FONT} fontWeight={600} fontSize={12} fill="#3a3a3a">Claude · ChatGPT — your subscription, no API key</text>
      <rect x={680} y={104} width={370} height={46} rx={14} fill="var(--color-paper-white)" stroke={INK} strokeWidth={2} />
      <text x={865} y={132} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={14} fill={INK}>reads state · calls tools</text>
      <rect x={680} y={172} width={370} height={46} rx={14} fill="var(--color-lavender)" stroke={INK} strokeWidth={2} />
      <text x={865} y={200} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={14} fill={INK}>watches the lesson with you</text>

      {/* WebMCP bridge */}
      <path className="draw" d="M462,155 L 638,155" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
      <path d="M650,155 l-14,-8 v16 z" fill={INK} />
      <path d="M450,155 l14,-8 v16 z" fill={INK} />
      <rect x={498} y={108} width={104} height={34} rx={17} fill="var(--color-cherry-wash)" stroke={INK} strokeWidth={2} />
      <text x={550} y={130} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={14} fill={INK}>WebMCP</text>

      {/* Human-only gate */}
      <path d="M235,282 C 235,340 350,356 425,358" fill="none" stroke={INK} strokeWidth={2.5} strokeDasharray="7 7" strokeLinecap="round" />
      <path d="M865,282 C 865,340 750,356 675,358" fill="none" stroke={INK} strokeWidth={2.5} strokeDasharray="7 7" strokeLinecap="round" />
      <rect x={430} y={330} width={240} height={56} rx={18} fill="var(--color-sunburst)" stroke={INK} strokeWidth={3} />
      <text x={550} y={353} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={14} fill={INK}>Approvals · trust · memory</text>
      <text x={550} y={373} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={11} letterSpacing={2} fill={INK}>HUMAN ONLY</text>
    </svg>
  );
}

/** #4 CARRY — one bundle, every host, plus a standalone verifier. */
export function CarryFlow() {
  return (
    <svg viewBox="0 0 1100 300" role="img" aria-label="Flow: the exported skill bundle installs into Claude Code under ~/.claude/skills (validated in a live session), ships a Codex install target, and includes verify.mjs, a standalone integrity check.">
      <PillNode x={20} y={110} w={240} h={80} fill="var(--color-cherry-wash)" label="skill-bundle.zip" sub="steps · evidence · checks" strokeWidth={3} />
      <CurveArrow d="M265,150 C 430,150 500,60 662,58" tipX={675} tipY={57} />
      <CurveArrow d="M265,150 L 662,150" tipX={675} tipY={150} />
      <CurveArrow d="M265,150 C 430,150 500,240 662,242" tipX={675} tipY={243} />
      <PillNode x={680} y={25} w={400} h={64} fill="var(--color-cream)" label="Claude Code" sub="~/.claude/skills — validated in a live session" />
      <PillNode x={680} y={118} w={400} h={64} fill="var(--color-sky-wash)" label="Codex / ChatGPT" sub="install target included" />
      <PillNode x={680} y={211} w={400} h={64} fill="#e2f8ee" label="verify.mjs" sub="standalone integrity check" />
    </svg>
  );
}

/** Engraved ray burst behind the hero cherry — deterministic, decorative. */
export function RaysBurst() {
  const rays = Array.from({ length: 36 }, (_, index) => {
    const angle = (index / 36) * Math.PI * 2;
    const inner = 82 + (index % 3) * 14;
    const outer = 152 + (index % 5) * 20;
    return {
      x1: Math.cos(angle) * inner,
      y1: Math.sin(angle) * inner,
      x2: Math.cos(angle) * outer,
      y2: Math.sin(angle) * outer,
      width: index % 2 === 0 ? 2 : 1,
      opacity: 0.35 + (index % 3) * 0.18,
    };
  });
  return (
    <svg className="rays" viewBox="-200 -200 400 400" aria-hidden="true" focusable="false">
      {rays.map((ray, index) => (
        <line key={index} x1={ray.x1} y1={ray.y1} x2={ray.x2} y2={ray.y2} stroke="currentColor" strokeWidth={ray.width} opacity={ray.opacity} strokeLinecap="round" />
      ))}
    </svg>
  );
}
