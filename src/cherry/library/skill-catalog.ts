/**
 * The preloaded skill catalog: ~1k third-party Agent Skills shipped as static
 * assets so a fresh browser is never staring at an empty shelf.
 *
 * A catalog entry is REFERENCE MATERIAL, never a Cherry-derived skill. It keeps
 * its upstream repo, license and content hash, and it is not a SkillGraph and
 * not approved by anyone. It becomes a real skill only when someone installs it,
 * and that install runs the ordinary lesson -> transcript -> derivation pipeline
 * so the result carries the same citations and human gates as anything taught
 * by hand. Nothing here is presented as this person's own approved method.
 */

export interface CatalogIndexEntry {
  id: string;
  name: string;
  /** Truncated for the index; the shard carries the full text. */
  description: string;
  collection: string;
  tags: string[];
  shard: number;
}

export interface CatalogSkill extends CatalogIndexEntry {
  collectionTitle: string;
  repo: string;
  license: string;
  publisher: string;
  upstreamPath: string;
  bytes: number;
  sha256: string;
  content: string;
}

export interface CatalogCollection {
  slug: string;
  title: string;
  repo: string;
  license: string;
  publisher: string;
  count: number;
}

export interface CatalogManifest {
  version: number;
  builtAt: string;
  totalSkills: number;
  collections: CatalogCollection[];
}

export interface CatalogMatch extends CatalogIndexEntry {
  score: number;
  matchedOn: string[];
}

const BASE = '/catalog';

let indexPromise: Promise<CatalogIndexEntry[]> | null = null;
let manifestPromise: Promise<CatalogManifest | null> | null = null;
const shardCache = new Map<number, Promise<Record<string, CatalogSkill> | null>>();

/** Test seam: drop every cached fetch so a suite can swap the fixtures. */
export function resetCatalogCache(): void {
  indexPromise = null;
  manifestPromise = null;
  shardCache.clear();
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(path, { headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    // The catalog is an enhancement, never a dependency: a browser that cannot
    // reach it (offline first load, blocked asset) still gets the whole app.
    return null;
  }
}

export async function loadCatalogIndex(): Promise<CatalogIndexEntry[]> {
  indexPromise ??= (async () => {
    const raw = await fetchJson<{ skills?: Array<Record<string, unknown>> }>(`${BASE}/index.json`);
    if (!raw?.skills) return [];
    return raw.skills.map((entry) => ({
      id: String(entry.i ?? ''),
      name: String(entry.n ?? ''),
      description: String(entry.d ?? ''),
      collection: String(entry.c ?? ''),
      tags: Array.isArray(entry.t) ? entry.t.map(String) : [],
      shard: Number(entry.s ?? 0),
    })).filter((entry) => entry.id && entry.name);
  })();
  return indexPromise;
}

export async function loadCatalogManifest(): Promise<CatalogManifest | null> {
  manifestPromise ??= fetchJson<CatalogManifest>(`${BASE}/manifest.json`);
  return manifestPromise;
}

async function loadShard(shard: number): Promise<Record<string, CatalogSkill> | null> {
  let pending = shardCache.get(shard);
  if (!pending) {
    const name = String(shard).padStart(2, '0');
    pending = fetchJson<{ skills?: Record<string, CatalogSkill> }>(`${BASE}/shards/${name}.json`)
      .then((raw) => raw?.skills ?? null);
    shardCache.set(shard, pending);
  }
  return pending;
}

/** Read one catalog entry in full, fetching only the shard that holds it. */
export async function getCatalogSkill(id: string): Promise<CatalogSkill | null> {
  const index = await loadCatalogIndex();
  const entry = index.find((candidate) => candidate.id === id);
  if (!entry) return null;
  const shard = await loadShard(entry.shard);
  return shard?.[id] ?? null;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'i', 'in', 'is', 'it',
  'my', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'use', 'using', 'want', 'was', 'what',
  'when', 'with', 'you', 'your',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

/**
 * Explainable lexical ranking, deliberately the same shape as the installed
 * library's ranker: no model call, and every hit says which field matched. A
 * zero-overlap query returns nothing rather than a confident-looking guess.
 */
export function rankCatalog(entries: CatalogIndexEntry[], task: string, limit = 5): CatalogMatch[] {
  const queryTokens = [...new Set(tokenize(task))];
  if (queryTokens.length === 0) return [];

  const matches: CatalogMatch[] = [];
  for (const entry of entries) {
    const nameTokens = new Set(tokenize(entry.name));
    const descriptionTokens = new Set(tokenize(entry.description));
    const tagTokens = new Set(entry.tags.flatMap((tag) => tokenize(tag)));

    let score = 0;
    const matchedOn: string[] = [];
    for (const token of queryTokens) {
      if (nameTokens.has(token)) { score += 3; matchedOn.push(`name:${token}`); }
      if (tagTokens.has(token)) { score += 2; matchedOn.push(`tag:${token}`); }
      if (descriptionTokens.has(token)) { score += 1; matchedOn.push(`description:${token}`); }
    }
    if (score === 0) continue;
    matches.push({ ...entry, score, matchedOn: matchedOn.slice(0, 6) });
  }

  matches.sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id));
  return matches.slice(0, Math.max(1, limit));
}

export async function searchCatalog(task: string, limit = 5): Promise<CatalogMatch[]> {
  return rankCatalog(await loadCatalogIndex(), task, limit);
}

/** Bounded, honest citation line for an installed catalog skill. */
export function catalogAttribution(skill: CatalogSkill): string {
  return `${skill.name} — ${skill.repo} (${skill.license}), ${skill.upstreamPath}`;
}
