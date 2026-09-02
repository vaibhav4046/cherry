/**
 * Landing copy of record. Every string here is fixed by the God Mode directive
 * or derived from the claims matrix; tests pin it. Statuses use the public
 * vocabulary only (Validated, Shipped, Experimental, Roadmap, Available) and
 * "Connected" is never used because no live connector exists.
 */

export type PublicStatus = 'Validated' | 'Shipped' | 'Experimental' | 'Roadmap' | 'Available';

export const HERO = {
  eyebrow: 'Cherry / Open AI workforce',
  headline: 'One task. An entire AI team.',
  subhead:
    'Cherry turns Codex, Claude, Kimi and local models into teammates with tools, memory and isolated workspaces. They work in parallel and return with verified results.',
  primaryCta: { label: 'Run a real mission', to: '/studio/control' },
  secondaryCta: { label: 'See how Cherry works', to: '#how' },
  trustLine: 'Model-agnostic · Permission-scoped · Verification-backed',
} as const;

export interface TeammateExampleRow {
  name: string;
  role: string;
  line: string;
}

export const TEAMMATE_EXAMPLE_ROWS: readonly TeammateExampleRow[] = [
  { name: 'Chief', role: 'coordinator', line: 'Release mission planned. Four tasks can run in parallel.' },
  { name: 'Developer', role: 'build', line: 'Codex is working in an isolated repository worktree.' },
  { name: 'Research', role: 'research', line: 'Compared the current product against official benchmark sources.' },
  { name: 'Content', role: 'content', line: 'Drafted the launch post. Public publishing still needs approval.' },
  { name: 'Inbox', role: 'inbox', line: 'Twelve messages classified. Three draft replies need review.' },
  { name: 'Verifier', role: 'verify', line: 'The candidate build passed its required checks.' },
];

export interface LandingSectionCopy {
  id: string;
  number: string;
  kicker: string;
  heading: string;
  body: string;
}

/** Eleven headed sections follow the hero, in the directive's order. */
export const LANDING_SECTIONS: readonly LandingSectionCopy[] = [
  {
    id: 'how',
    number: '01',
    kicker: 'Give Cherry an outcome',
    heading: 'Describe the result. Cherry plans the work.',
    body: 'No workflow builder and no prompt chain to maintain. Cherry turns a clear outcome into tasks, dependencies, teammates, tools and checks.',
  },
  {
    id: 'team',
    number: '02',
    kicker: 'An entire team, created for the job',
    heading: 'Work in parallel without becoming the project manager.',
    body: 'Cherry assigns research, building, review and verification to separate workers, then preserves the handoffs in one mission.',
  },
  {
    id: 'connect',
    number: '03',
    kicker: 'Connect the tools you already use',
    heading: 'One capability layer for every tool.',
    body: 'MCP, WebMCP, plugins, APIs, browsers, terminals and local apps become permission-scoped Cherry capabilities.',
  },
  {
    id: 'computers',
    number: '04',
    kicker: 'A separate workspace for each worker',
    heading: 'Give every worker only the computer access it needs.',
    body: 'Repository workers use isolated worktrees. Browser and connector permissions stay separate. Cherry records the real boundary instead of calling every process a VM.',
  },
  {
    id: 'learn',
    number: '05',
    kicker: 'Teach Cherry once',
    heading: 'Teach once. Improve every teammate.',
    body: 'Add a lesson, demonstrate a workflow or approve a successful mission. Cherry turns it into a versioned skill with evidence, checks and an exact approval.',
  },
  {
    id: 'models',
    number: '06',
    kicker: 'Use any model',
    heading: 'Keep the workforce when the best model changes.',
    body: 'Codex can build, Claude can review, a local model can classify, and tomorrow’s model can join without taking your memory and workflows with it.',
  },
  {
    id: 'automations',
    number: '07',
    kicker: 'Automations that maintain outcomes',
    heading: 'Automate outcomes, not repeated prompts.',
    body: 'Run a routine on your paired computer, hand it to an eligible ChatGPT Work task, or export it for a Codex Automation. Every route states where it actually runs.',
  },
  {
    id: 'approvals',
    number: '08',
    kicker: 'Cherry returns only when it needs authority',
    heading: 'Routine work continues. Consequential work comes back to you.',
    body: 'Reading, drafting and local verification can continue automatically. Sending, publishing, deleting, spending and production changes follow your policy.',
  },
  {
    id: 'use-cases',
    number: '09',
    kicker: 'Real use cases',
    heading: 'Outcomes people hand to Cherry.',
    body: 'Each of these becomes a mission graph with teammates, isolated workspaces, checks and an approval boundary. Pick one to open the composer with it.',
  },
  {
    id: 'security',
    number: '10',
    kicker: 'Security and proof',
    heading: 'Every claim survives a recompute.',
    body: 'Cherry holds no credentials, runs workers under allowlists, keeps outside content untrusted, and seals every mutation into a ledger you can recompute.',
  },
  {
    id: 'start',
    number: '11',
    kicker: 'Start',
    heading: 'Give Cherry an outcome.',
    body: 'Open Mission Control, describe the result, and watch the team form. Nothing public happens without you.',
  },
];

export interface StatusRow {
  name: string;
  detail: string;
  status: PublicStatus;
}

/** Capability layer rows. Statuses mirror /compatibility and the claims matrix. */
export const CAPABILITY_ROWS: readonly StatusRow[] = [
  { name: 'MCP bridge for Codex CLI and Claude Code', detail: 'Read and verify Cherry workspaces from a local agent host. Captured in a live Codex CLI session.', status: 'Validated' },
  { name: 'WebMCP site tools', detail: 'Bounded page tools registered by state and surface, visible in Agent View. Mock-host tested; live ChatGPT capture pending.', status: 'Experimental' },
  { name: 'Agent Skills bundles', detail: 'SKILL.md, AGENTS.md and CLAUDE.md with a standalone verifier. Installed into a live Claude Code host.', status: 'Validated' },
  { name: 'Terminal through the paired runner', detail: 'Allowlisted executables only, argument arrays, no shell, minimal environment, output caps.', status: 'Shipped' },
  { name: 'Browser computer', detail: 'A visible, permission-scoped browser worker with human takeover for sign-in.', status: 'Roadmap' },
  { name: 'Gmail, GitHub, LinkedIn and YouTube connectors', detail: 'Official APIs behind approval. No scraping, no shared logins.', status: 'Roadmap' },
];

export const COMPUTER_ROWS: readonly StatusRow[] = [
  { name: 'Repository worker', detail: 'Its own git worktree on its own branch. Boundary: worktree-process.', status: 'Shipped' },
  { name: 'Writer and researcher', detail: 'A directory under an approved root. Boundary: process.', status: 'Shipped' },
  { name: 'Container or remote worker', detail: 'Docker, WSL and cloud providers behind the same lease interface. Boundary: container or cloud-sandbox.', status: 'Roadmap' },
];

export const MODEL_ROWS: readonly StatusRow[] = [
  { name: 'Codex', detail: 'Builds inside a worktree with an explicit sandbox flag. Uses your Codex sign-in and available Codex usage.', status: 'Available' },
  { name: 'Claude Code', detail: 'Reviews and repairs in a separate worktree through its non-interactive mode.', status: 'Available' },
  { name: 'Local models through Ollama', detail: 'Classification and extraction on this machine once tool use is validated.', status: 'Experimental' },
  { name: 'Kimi, Kilo and OpenAI-compatible endpoints', detail: 'Probed and labelled honestly before any work is assigned.', status: 'Roadmap' },
];

export interface RunPathRow extends StatusRow {
  runtime: string;
}

export const RUN_PATH_ROWS: readonly RunPathRow[] = [
  { name: 'Paired computer', runtime: 'Runs while this computer and Cherry Computer are online.', detail: 'Manual runs of an approved skill today. Timed routines register the exact approved version.', status: 'Shipped' },
  { name: 'ChatGPT Work', runtime: 'Runs in eligible ChatGPT cloud tasks after you create and authorize the task.', detail: 'Cherry writes the task recipe. You create it in ChatGPT.', status: 'Roadmap' },
  { name: 'Codex Automation', runtime: 'Runs in Codex according to Codex availability and usage.', detail: 'Cherry exports the automation definition with the verification command.', status: 'Roadmap' },
  { name: 'Cherry Cloud', runtime: 'A remote worker Cherry operates.', detail: 'Not deployed. Nothing on this page claims it.', status: 'Roadmap' },
];

export interface PolicyRow {
  action: string;
  decision: 'Automatic' | 'Approval' | 'Denied';
}

export const POLICY_ROWS: readonly PolicyRow[] = [
  { action: 'Read approved local context and analyse it', decision: 'Automatic' },
  { action: 'Write inside an isolated sandbox and run approved tests', decision: 'Automatic' },
  { action: 'Draft an email or a post', decision: 'Automatic' },
  { action: 'Send email or publish social content', decision: 'Approval' },
  { action: 'Merge code or deploy production', decision: 'Approval' },
  { action: 'Delete data, spend money or change credentials', decision: 'Approval' },
  { action: 'Bypass a security control', decision: 'Denied' },
];

export interface UseCase {
  title: string;
  outcome: string;
}

export const USE_CASES: readonly UseCase[] = [
  { title: 'Repository maintenance', outcome: 'Audit this repository and fix the highest-impact defect.' },
  { title: 'Creator content', outcome: 'Prepare today’s creator content from my real project activity.' },
  { title: 'Inbox ownership', outcome: 'Own my actionable inbox and leave consequential replies for review.' },
  { title: 'Research brief', outcome: 'Research this market and produce an evidence-backed launch brief.' },
];

export interface MissionDemoNode {
  id: string;
  title: string;
  host: string;
  boundary: string;
  dependsOn: string[];
  kind: 'agent' | 'verify' | 'human';
}

/** The demo graph, mirroring the release-mission template. */
export const MISSION_DEMO_OUTCOME =
  'Audit Cherry against its strongest competitor, fix the highest-impact onboarding defect, and prepare the launch content. Nothing public without approval.';

export const MISSION_DEMO_NODES: readonly MissionDemoNode[] = [
  { id: 'research-competitor', title: 'Research the competitor', host: 'Claude Code', boundary: 'process', dependsOn: [], kind: 'agent' },
  { id: 'audit-onboarding', title: 'Audit onboarding', host: 'Codex', boundary: 'worktree-process', dependsOn: [], kind: 'agent' },
  { id: 'prioritise', title: 'Prioritise', host: 'Chief', boundary: 'process', dependsOn: ['research-competitor', 'audit-onboarding'], kind: 'agent' },
  { id: 'developer-fix', title: 'Developer fix', host: 'Codex', boundary: 'worktree-process', dependsOn: ['prioritise'], kind: 'agent' },
  { id: 'content-draft', title: 'Content draft', host: 'Claude Code', boundary: 'process', dependsOn: ['prioritise'], kind: 'agent' },
  { id: 'independent-verification', title: 'Independent verification', host: 'Cherry checks', boundary: 'worktree-process', dependsOn: ['developer-fix', 'content-draft'], kind: 'verify' },
  { id: 'publish-approval', title: 'Publish approval', host: 'You', boundary: 'human decision', dependsOn: ['independent-verification'], kind: 'human' },
];

export const STATUS_CLASS: Record<PublicStatus, string> = {
  Validated: 'sticker sticker-pass',
  Shipped: 'sticker sticker-cherry',
  Available: 'sticker sticker-blue',
  Experimental: 'sticker sticker-wait',
  Roadmap: 'sticker',
};
