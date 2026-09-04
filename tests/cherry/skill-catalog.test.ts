import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { GLOBAL_TOOLS, TOOL_STATE_TABLE } from '../../src/cherry/webmcp/tool-definitions.ts';
import {
  loadCatalogIndex,
  rankCatalog,
  resetCatalogCache,
  searchCatalog,
  catalogAttribution,
  type CatalogIndexEntry,
} from '../../src/cherry/library/skill-catalog.ts';

const CATALOG_DIR = resolve(__dirname, '../../public/catalog');
const hasBuiltCatalog = existsSync(resolve(CATALOG_DIR, 'index.json'));

/** Serve the real built catalog off disk so these are not fixture-shaped lies. */
function stubFetchFromDisk(): void {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const path = String(input).replace(/^\/catalog/, '');
    const file = resolve(CATALOG_DIR, `.${path}`);
    if (!existsSync(file)) return new Response('not found', { status: 404 });
    return new Response(readFileSync(file, 'utf8'), { status: 200 });
  });
}

describe('skill catalog', () => {
  beforeEach(() => {
    resetCatalogCache();
    stubFetchFromDisk();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetCatalogCache();
  });

  it('never grows the always-on aperture', () => {
    expect(GLOBAL_TOOLS).toHaveLength(7);
    expect(GLOBAL_TOOLS as readonly string[]).not.toContain('install_catalog_skill');
  });

  it('keeps every state inside the five-contextual-tool bound after adding the catalog', () => {
    for (const [state, tools] of Object.entries(TOOL_STATE_TABLE)) {
      expect(tools.length, `${state} exceeds the contextual bound`).toBeLessThanOrEqual(5);
    }
    expect(TOOL_STATE_TABLE.empty).toContain('install_catalog_skill');
  });

  it('returns nothing rather than a confident guess when no word overlaps', () => {
    const entries: CatalogIndexEntry[] = [
      { id: 'a/one', name: 'analyzing email headers', description: 'phishing forensics', collection: 'a', tags: [], shard: 0 },
    ];
    expect(rankCatalog(entries, 'bake a sourdough loaf')).toEqual([]);
  });

  it('ranks a name hit above a description-only hit', () => {
    const entries: CatalogIndexEntry[] = [
      { id: 'a/desc', name: 'unrelated title', description: 'covers kubernetes clusters', collection: 'a', tags: [], shard: 0 },
      { id: 'a/name', name: 'kubernetes hardening', description: 'unrelated body', collection: 'a', tags: [], shard: 0 },
    ];
    const ranked = rankCatalog(entries, 'kubernetes');
    expect(ranked[0]?.id).toBe('a/name');
    expect(ranked[0]?.matchedOn).toContain('name:kubernetes');
  });

  it('degrades to an empty catalog instead of throwing when the assets are unreachable', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
    resetCatalogCache();
    await expect(loadCatalogIndex()).resolves.toEqual([]);
    await expect(searchCatalog('anything')).resolves.toEqual([]);
  });

  it('carries license and repo into the attribution line', () => {
    const line = catalogAttribution({
      id: 'workflows/x', name: 'X', description: 'd', collection: 'workflows', tags: [], shard: 1,
      collectionTitle: 'W', repo: 'wshobson/agents', license: 'MIT', publisher: 'community',
      upstreamPath: 'plugins/a/skills/x/SKILL.md', bytes: 10, sha256: 'abc', content: '',
    });
    expect(line).toContain('wshobson/agents');
    expect(line).toContain('MIT');
    expect(line).toContain('plugins/a/skills/x/SKILL.md');
  });

  describe.skipIf(!hasBuiltCatalog)('against the built catalog', () => {
    it('ships a non-trivial index whose every entry is addressable', async () => {
      const index = await loadCatalogIndex();
      expect(index.length).toBeGreaterThan(500);
      for (const entry of index) {
        expect(entry.id).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+$/);
        expect(entry.name.length).toBeGreaterThan(0);
        expect(entry.shard).toBeGreaterThanOrEqual(0);
      }
    });

    it('only ships collections whose license permits redistribution', () => {
      const manifest = JSON.parse(readFileSync(resolve(CATALOG_DIR, 'manifest.json'), 'utf8')) as {
        collections: Array<{ license: string; repo: string; count: number }>;
      };
      const allowed = new Set(['MIT', 'Apache-2.0', 'CC-BY-SA-4.0']);
      for (const collection of manifest.collections) {
        expect(allowed.has(collection.license), `${collection.repo} ships under ${collection.license}`).toBe(true);
        expect(collection.repo).toMatch(/^[\w.-]+\/[\w.-]+$/);
      }
    });

    it('finds a real security skill by task words', async () => {
      const matches = await searchCatalog('analyze phishing email headers', 5);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0]!.score).toBeGreaterThan(0);
    });
  });
});
