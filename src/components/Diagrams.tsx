/**
 * Illustrated art plates — the product explained as engraved-style posters.
 * Duotone language: deep maroon ground, cream ink, cherry-pop accents. Every
 * object is drawn (video player, ledger, hash seal, receipt, browser, agent,
 * suitcase) and every claim on a plate is product truth.
 */

const INK = '#000';
const CREAM = '#fff6e9';
const MAROON = '#4a0e1e';
const DEEP = '#6b1330';
const POP = '#ff4f78';
const BLUSH = '#ffd9e4';
const SUN = '#ffd731';
const MINT = '#55db9c';
const SKY = '#dceeff';
const FONT = "'Inter', ui-sans-serif, system-ui, sans-serif";
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

function Plate({ w, h, children }: { w: number; h: number; children: React.ReactNode }) {
  return (
    <g>
      <rect x={1} y={1} width={w - 2} height={h - 2} rx={28} fill="#260c14" stroke="rgba(255, 143, 171, 0.5)" strokeWidth={1.5} />
      <rect x={16} y={16} width={w - 32} height={h - 32} rx={18} fill="none" stroke={CREAM} strokeWidth={1.5} strokeDasharray="2 6" opacity={0.35} />
      {children}
    </g>
  );
}

/** Chunky cream flow arrow — the shaft draws in on reveal. */
function Flow({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  return (
    <g>
      <path className="draw" d={`M${x1},${y} L${x2 - 16},${y}`} stroke={CREAM} strokeWidth={4} fill="none" strokeLinecap="round" />
      <path d={`M${x2},${y} l-17,-9 v18 z`} fill={CREAM} />
    </g>
  );
}

function Label({ x, y, title, sub }: { x: number; y: number; title: string; sub?: string }) {
  return (
    <g>
      <text x={x} y={y} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={15} letterSpacing={1.5} fill={CREAM}>{title}</text>
      {sub ? <text x={x} y={y + 21} textAnchor="middle" fontFamily={FONT} fontWeight={600} fontSize={12} fill={CREAM} opacity={0.68}>{sub}</text> : null}
    </g>
  );
}

/** 01 TEACH — video player → transcript → draft → approval seal → skill tag. */
export function TeachFlow() {
  return (
    <svg viewBox="0 0 1200 400" role="img" aria-label="Illustrated flow: a lesson (video, doc, or pasted text) becomes a timestamped transcript, then editable draft steps, then passes your approval — the human gate, bound to the exact revision — and comes out as your versioned skill.">
      <Plate w={1200} h={400}>
        {/* Video player */}
        <rect x={55} y={115} width={200} height={150} rx={16} fill={DEEP} stroke={CREAM} strokeWidth={3} />
        <path d="M138,162 l44,26 -44,26 z" fill={CREAM} />
        <line x1={78} y1={242} x2={232} y2={242} stroke={CREAM} strokeWidth={3} strokeLinecap="round" />
        <circle cx={125} cy={242} r={6} fill={POP} stroke={INK} strokeWidth={1.5} />
        <Label x={155} y={310} title="ANY LESSON" sub="video · doc · pasted text" />
        <Flow x1={272} x2={322} y={190} />

        {/* Transcript */}
        <rect x={332} y={115} width={190} height={150} rx={14} fill={CREAM} stroke={INK} strokeWidth={2.5} />
        {[140, 168, 196, 224].map((y) => (
          <g key={y}>
            <rect x={348} y={y} width={36} height={15} rx={7} fill={BLUSH} stroke={INK} strokeWidth={1.5} />
            <line x1={394} y1={y + 8} x2={504} y2={y + 8} stroke={MAROON} strokeWidth={3.5} strokeLinecap="round" />
          </g>
        ))}
        <Label x={427} y={310} title="TRANSCRIPT" sub="timestamped evidence" />
        <Flow x1={540} x2={588} y={190} />

        {/* Draft checklist */}
        <rect x={598} y={115} width={190} height={150} rx={14} fill={CREAM} stroke={INK} strokeWidth={2.5} />
        {[141, 186, 231].map((y) => (
          <g key={y}>
            <rect x={616} y={y - 10} width={21} height={21} rx={6} fill={MINT} stroke={INK} strokeWidth={2} />
            <path d={`M621,${y} l5,6 9,-11`} fill="none" stroke={INK} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            <line x1={650} y1={y} x2={768} y2={y} stroke={MAROON} strokeWidth={3.5} strokeLinecap="round" />
          </g>
        ))}
        <Label x={693} y={310} title="DRAFT STEPS" sub="derived · editable" />
        <Flow x1={805} x2={848} y={190} />

        {/* Approval seal — the human gate */}
        <circle cx={928} cy={190} r={72} fill={SUN} stroke={INK} strokeWidth={3} />
        <circle cx={928} cy={190} r={56} fill="none" stroke={INK} strokeWidth={1.5} strokeDasharray="5 5" />
        <path d="M898,192 l20,20 l42,-48" fill="none" stroke={INK} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
        <Label x={928} y={310} title="YOU APPROVE" sub="human gate · exact revision" />
        <Flow x1={1012} x2={1052} y={190} />

        {/* Skill tag */}
        <path d="M1062,152 h96 a14,14 0 0 1 14,14 v48 a14,14 0 0 1 -14,14 h-96 l-26,-38 z" fill={POP} stroke={INK} strokeWidth={2.5} />
        <circle cx={1052} cy={190} r={6} fill={MAROON} stroke={INK} strokeWidth={2} />
        <text x={1112} y={196} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={16} fill={CREAM}>v0.1.0</text>
        <Label x={1105} y={310} title="YOUR SKILL" sub="versioned · portable" />
      </Plate>
    </svg>
  );
}

/** 02 PROVE — ledger → canonical JSON → hash seal → receipt, with the recompute loop. */
export function ProofFlow() {
  return (
    <svg viewBox="0 0 1200 420" role="img" aria-label="Illustrated pipeline: every action lands in an append-only event ledger, is serialised as canonical JSON per RFC 8785, hashed with SHA-256, and sealed into a receipt — and anyone can recompute the hashes, which must match.">
      <Plate w={1200} h={420}>
        {/* Ledger book */}
        <rect x={60} y={130} width={190} height={140} rx={12} fill={CREAM} stroke={INK} strokeWidth={2.5} />
        <line x1={155} y1={135} x2={155} y2={265} stroke={MAROON} strokeWidth={2.5} />
        {[160, 185, 210, 235].map((y) => (
          <g key={y}>
            <line x1={76} y1={y} x2={140} y2={y} stroke={MAROON} strokeWidth={2.5} strokeLinecap="round" />
            <line x1={170} y1={y} x2={234} y2={y} stroke={MAROON} strokeWidth={2.5} strokeLinecap="round" />
          </g>
        ))}
        <circle cx={250} cy={135} r={15} fill={MINT} stroke={INK} strokeWidth={2} />
        <path d="M244,135 h12 M250,129 v12" stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
        <Label x={155} y={312} title="EVENT LEDGER" sub="append-only" />
        <Flow x1={282} x2={330} y={200} />

        {/* Canonical JSON */}
        <rect x={340} y={130} width={200} height={140} rx={14} fill={DEEP} stroke={CREAM} strokeWidth={3} />
        <text x={440} y={218} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={54} fill={CREAM}>{'{ }'}</text>
        <text x={440} y={250} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={12} letterSpacing={2} fill={CREAM} opacity={0.7}>RFC 8785</text>
        <Label x={440} y={312} title="CANONICAL JSON" sub="one true byte order" />
        <Flow x1={572} x2={620} y={200} />

        {/* Hash seal */}
        <circle cx={706} cy={200} r={66} fill={POP} stroke={INK} strokeWidth={3} />
        {Array.from({ length: 12 }, (_, index) => {
          const angle = (index / 12) * Math.PI * 2;
          return (
            <line
              key={index}
              x1={706 + Math.cos(angle) * 72}
              y1={200 + Math.sin(angle) * 72}
              x2={706 + Math.cos(angle) * 82}
              y2={200 + Math.sin(angle) * 82}
              stroke={CREAM}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          );
        })}
        <text x={706} y={194} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={24} fill={CREAM}>SHA</text>
        <text x={706} y={224} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={24} fill={CREAM}>256</text>
        <Label x={706} y={312} title="HASHED" sub="content-addressed" />
        <Flow x1={800} x2={848} y={200} />

        {/* Receipt with zigzag edge */}
        <path d="M858,112 h180 v160 l-18,14 -18,-14 -18,14 -18,-14 -18,14 -18,-14 -18,14 -18,-14 -18,14 -18,-14 z" fill={CREAM} stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
        {[142, 164, 186].map((y) => (
          <line key={y} x1={874} y1={y} x2={1022} y2={y} stroke={MAROON} strokeWidth={3} strokeLinecap="round" />
        ))}
        <line x1={874} y1={210} x2={1022} y2={210} stroke={MAROON} strokeWidth={1.5} strokeDasharray="4 4" />
        <circle cx={892} cy={238} r={13} fill={MINT} stroke={INK} strokeWidth={2} />
        <path d="M886,238 l4,5 8,-9" fill="none" stroke={INK} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        <line x1={914} y1={238} x2={1022} y2={238} stroke={MAROON} strokeWidth={3} strokeLinecap="round" />
        <Label x={948} y={330} title="RECEIPT" sub="recomputable by anyone" />

        {/* Recompute loop */}
        <path d="M1000,315 C 1000,382 240,382 160,300" fill="none" stroke={CREAM} strokeWidth={2.5} strokeDasharray="8 8" strokeLinecap="round" />
        <path d="M156,292 l-6,17 17,-3 z" fill={CREAM} />
        <text x={600} y={396} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={13} letterSpacing={1.5} fill={CREAM}>
          ANYONE CAN RECOMPUTE — IT MUST MATCH
        </text>
      </Plate>
    </svg>
  );
}

/** 03 CONNECT — browser window ⇄ WebMCP cable ⇄ agent, human-only gate below. */
export function ConnectArch() {
  const chips = [200, 252, 304, 356, 408];
  return (
    <svg viewBox="0 0 1200 470" role="img" aria-label="Illustrated architecture: your browser tab runs Cherry Wine locally with the mission state and at most five tools exposed; a WebMCP cable connects it to your own Claude or ChatGPT subscription, which reads state, calls tools, and watches the lesson with you. Below sits the gate: approvals, trust, and memory are human-only.">
      <Plate w={1200} h={470}>
        {/* Browser window */}
        <rect x={50} y={70} width={440} height={270} rx={18} fill={CREAM} stroke={INK} strokeWidth={3} />
        <line x1={52} y1={112} x2={488} y2={112} stroke={INK} strokeWidth={2} />
        <circle cx={80} cy={91} r={7} fill={POP} stroke={INK} strokeWidth={1.5} />
        <circle cx={104} cy={91} r={7} fill={SUN} stroke={INK} strokeWidth={1.5} />
        <circle cx={128} cy={91} r={7} fill={MINT} stroke={INK} strokeWidth={1.5} />
        <rect x={150} y={80} width={250} height={22} rx={11} fill={BLUSH} stroke={INK} strokeWidth={1.5} />
        <text x={275} y={95} textAnchor="middle" fontFamily={MONO} fontWeight={600} fontSize={11} fill={MAROON}>cherry-wine.vercel.app</text>
        {/* mini cherry inside */}
        <path d="M128,132 C 116,148 110,166 114,182 M128,132 C 140,142 146,158 142,172" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
        <path d="M128,132 c 10,-6 22,-4 27,3 c -9,5 -20,4 -27,-3 z" fill={MINT} stroke={INK} strokeWidth={2.5} />
        <circle cx={110} cy={205} r={26} fill={POP} stroke={INK} strokeWidth={3.5} />
        <circle cx={148} cy={192} r={21} fill={DEEP} stroke={INK} strokeWidth={3.5} />
        {/* mission state + tool chips */}
        <rect x={200} y={135} width={250} height={34} rx={10} fill={SKY} stroke={INK} strokeWidth={2} />
        <text x={325} y={157} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={13} fill={INK}>MISSION STATE</text>
        {chips.map((x, index) => (
          <g key={x}>
            <rect x={x} y={190} width={44} height={34} rx={8} fill={MAROON} stroke={INK} strokeWidth={2} />
            <text x={x + 22} y={212} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={12} fill={CREAM}>{`T${index + 1}`}</text>
          </g>
        ))}
        <text x={200} y={252} fontFamily={FONT} fontWeight={700} fontSize={12} fill={MAROON}>5 tools at a time · state-aware</text>
        <Label x={270} y={378} title="YOUR BROWSER TAB" sub="Cherry Wine — local-first, no cloud" />

        {/* Agent card */}
        <rect x={710} y={70} width={440} height={270} rx={18} fill={DEEP} stroke={CREAM} strokeWidth={3} />
        <line x1={930} y1={98} x2={930} y2={80} stroke={CREAM} strokeWidth={3} strokeLinecap="round" />
        <circle cx={930} cy={74} r={7} fill={POP} stroke={INK} strokeWidth={1.5} />
        <circle cx={930} cy={152} r={52} fill={CREAM} stroke={INK} strokeWidth={2.5} />
        <rect x={906} y={136} width={15} height={22} rx={5} fill={MAROON} />
        <rect x={939} y={136} width={15} height={22} rx={5} fill={MAROON} />
        <path d="M910,172 q 20,14 40,0" fill="none" stroke={MAROON} strokeWidth={4} strokeLinecap="round" />
        <rect x={760} y={228} width={340} height={36} rx={18} fill={MAROON} stroke={CREAM} strokeWidth={1.5} />
        <text x={930} y={251} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={13} fill={CREAM}>reads state · calls tools</text>
        <rect x={760} y={276} width={340} height={36} rx={18} fill={MAROON} stroke={CREAM} strokeWidth={1.5} />
        <text x={930} y={299} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={13} fill={CREAM}>watches the lesson with you</text>
        <Label x={930} y={378} title="YOUR AGENT" sub="Claude · ChatGPT — your subscription, no API key" />

        {/* WebMCP cable */}
        <path className="draw" d="M494,205 C 550,205 560,160 600,160 C 640,160 650,205 706,205" fill="none" stroke={CREAM} strokeWidth={5} strokeLinecap="round" />
        <rect x={487} y={192} width={13} height={26} rx={4} fill={CREAM} stroke={INK} strokeWidth={1.5} />
        <rect x={700} y={192} width={13} height={26} rx={4} fill={CREAM} stroke={INK} strokeWidth={1.5} />
        <rect x={545} y={112} width={110} height={36} rx={18} fill={POP} stroke={INK} strokeWidth={2.5} />
        <text x={600} y={136} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={15} fill={CREAM}>WebMCP</text>

        {/* Human-only gate */}
        <path d="M270,342 C 270,412 360,428 428,428" fill="none" stroke={CREAM} strokeWidth={2.5} strokeDasharray="7 7" strokeLinecap="round" />
        <path d="M930,342 C 930,412 840,428 772,428" fill="none" stroke={CREAM} strokeWidth={2.5} strokeDasharray="7 7" strokeLinecap="round" />
        <rect x={432} y={400} width={336} height={54} rx={16} fill={SUN} stroke={INK} strokeWidth={3} />
        <rect x={452} y={422} width={22} height={17} rx={4} fill={INK} />
        <path d="M456,422 v-7 a7,7 0 0 1 14,0 v7" fill="none" stroke={INK} strokeWidth={3} />
        <text x={614} y={422} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={14} fill={INK}>APPROVALS · TRUST · MEMORY</text>
        <text x={614} y={442} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={10} letterSpacing={2} fill={INK}>HUMAN ONLY — NO TOOL CROSSES THIS LINE</text>
      </Plate>
    </svg>
  );
}

/** 04 CARRY — the bundle suitcase fans out to three destination tickets. */
export function CarryFlow() {
  const tickets = [
    { y: 48, title: 'CLAUDE CODE', sub: '~/.claude/skills — validated in a live session' },
    { y: 158, title: 'CODEX / CHATGPT', sub: 'install target included' },
    { y: 268, title: 'VERIFY.MJS', sub: 'standalone integrity check — no Cherry required' },
  ];
  return (
    <svg viewBox="0 0 1200 400" role="img" aria-label="Illustrated flow: the exported skill bundle travels to three destinations — Claude Code under ~/.claude/skills (validated in a live session), a Codex install target, and verify.mjs, a standalone integrity check.">
      <Plate w={1200} h={400}>
        {/* Suitcase */}
        <path d="M150,120 c 0,-30 70,-30 70,0" fill="none" stroke={INK} strokeWidth={6} />
        <rect x={70} y={120} width={230} height={160} rx={20} fill={POP} stroke={INK} strokeWidth={3} />
        <line x1={70} y1={252} x2={300} y2={252} stroke={INK} strokeWidth={2} strokeDasharray="6 6" />
        <circle cx={185} cy={195} r={41} fill={CREAM} stroke={INK} strokeWidth={2.5} />
        <path d="M185,172 C 177,184 174,196 177,206 M185,172 C 193,180 196,190 193,199" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
        <circle cx={175} cy={214} r={11} fill={POP} stroke={INK} strokeWidth={2.5} />
        <circle cx={196} cy={208} r={9} fill={DEEP} stroke={INK} strokeWidth={2.5} />
        <Label x={185} y={324} title="SKILL-BUNDLE.ZIP" sub="steps · evidence · checks" />

        {/* Fan-out */}
        <g>
          <path className="draw" d="M312,200 C 480,200 560,90 726,90" fill="none" stroke={CREAM} strokeWidth={4} strokeLinecap="round" />
          <path d="M744,90 l-17,-9 v18 z" fill={CREAM} />
          <path className="draw" d="M312,200 L 726,200" fill="none" stroke={CREAM} strokeWidth={4} strokeLinecap="round" />
          <path d="M744,200 l-17,-9 v18 z" fill={CREAM} />
          <path className="draw" d="M312,200 C 480,200 560,310 726,310" fill="none" stroke={CREAM} strokeWidth={4} strokeLinecap="round" />
          <path d="M744,310 l-17,-9 v18 z" fill={CREAM} />
        </g>

        {/* Tickets */}
        {tickets.map((ticket) => (
          <g key={ticket.title}>
            <rect x={752} y={ticket.y} width={380} height={84} rx={14} fill={CREAM} stroke={INK} strokeWidth={2.5} />
            <circle cx={752} cy={ticket.y + 42} r={11} fill={MAROON} stroke={INK} strokeWidth={2} />
            <line x1={800} y1={ticket.y + 10} x2={800} y2={ticket.y + 74} stroke={INK} strokeWidth={1.5} strokeDasharray="5 5" />
            <text x={820} y={ticket.y + 38} fontFamily={MONO} fontWeight={700} fontSize={15} letterSpacing={1} fill={INK}>{ticket.title}</text>
            <text x={820} y={ticket.y + 60} fontFamily={FONT} fontWeight={600} fontSize={12} fill="#3a3a3a">{ticket.sub}</text>
          </g>
        ))}
      </Plate>
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
