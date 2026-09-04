#!/usr/bin/env node
/**
 * Build Cherry's preloaded skill catalog from permissively-licensed upstream
 * Agent Skill collections.
 *
 * The catalog is REFERENCE MATERIAL, not Cherry's own output. Every entry keeps
 * the upstream repo, license, path and a content hash so a reader can check the
 * text against its source. Nothing here is presented as a Cherry-derived skill;
 * a catalog entry only becomes a SkillGraph when a human or agent installs it,
 * and that install runs the ordinary lesson -> transcript -> derivation pipeline.
 *
 * Output (all static, lazily fetched by the browser):
 *   public/catalog/manifest.json   provenance + shard hashes
 *   public/catalog/index.json      compact search index (no bodies)
 *   public/catalog/shards/NN.json  bodies, hash-sharded for even size
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const HOME = process.env.CLAUDE_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.claude');
const OUT = resolve(process.argv[2] ?? 'public/catalog');
const SHARD_COUNT = 24;

/**
 * Allowlist. A collection ships only if its LICENSE permits redistribution and
 * we can name the real upstream repo. `publisher` is deliberately explicit:
 * a repo NAMED "Anthropic-..." is not necessarily published by Anthropic.
 */
const COLLECTIONS = [
  { slug: 'cybersecurity', dir: 'skills/Anthropic-Cybersecurity-Skills/skills', repo: 'mukul975/Anthropic-Cybersecurity-Skills', license: 'Apache-2.0', publisher: 'community', title: 'Cybersecurity Skills' },
  { slug: 'workflows', dir: 'plugins/marketplaces/claude-code-workflows', repo: 'wshobson/agents', license: 'MIT', publisher: 'community', title: 'Claude Code Workflows' },
  { slug: 'anthropic-official', dir: 'plugins/marketplaces/claude-plugins-official', repo: 'anthropics/claude-plugins-official', license: 'Apache-2.0', publisher: 'Anthropic', title: 'Anthropic Official Plugins' },
  { slug: 'trailofbits', dir: 'plugins/marketplaces/trailofbits', repo: 'trailofbits/skills', license: 'CC-BY-SA-4.0', publisher: 'Trail of Bits', title: 'Trail of Bits Security Skills' },
  { slug: 'impeccable', dir: 'plugins/marketplaces/impeccable', repo: 'pbakaus/impeccable', license: 'Apache-2.0', publisher: 'community', title: 'Impeccable' },
  { slug: 'ponytail', dir: 'plugins/marketplaces/ponytail', repo: 'DietrichGebert/ponytail', license: 'MIT', publisher: 'community', title: 'Ponytail' },
  { slug: 'caveman', dir: 'plugins/marketplaces/caveman', repo: 'JuliusBrussee/caveman', license: 'MIT', publisher: 'community', title: 'Caveman' },
  { slug: 'obsidian', dir: 'plugins/marketplaces/obsidian-skills', repo: 'kepano/obsidian-skills', license: 'MIT', publisher: 'community', title: 'Obsidian Skills' },
];

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

function walk(dir, out = []) {
  let dirEntries;
  try { dirEntries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of dirEntries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('__')) continue;
      walk(full, out);
    } else if (entry.name === 'SKILL.md') {
      out.push(full);
    }
  }
  return out;
}

const unquote = (value) => value.trim().replace(/^["'](.*)["']$/, '$1').trim();
const slugify = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

/**
 * Minimal YAML front-matter reader: scalars, folded multi-line scalars and
 * block sequences are all these files use. Anything richer is ignored rather
 * than guessed at, so a parse never invents a field.
 */
function parseFrontmatter(text) {
  if (!text.startsWith('---')) return { data: {}, body: text };
  const end = text.indexOf('\n---', 3);
  if (end < 0) return { data: {}, body: text };
  const raw = text.slice(text.indexOf('\n') + 1, end);
  const bodyBreak = text.indexOf('\n', end + 1);
  const body = bodyBreak < 0 ? '' : text.slice(bodyBreak + 1);
  const data = {};
  let key = null;
  let list = null;
  for (const line of raw.split('\n')) {
    if (/^\s*#/.test(line) || line.trim() === '') continue;
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && key) {
      list = list ?? [];
      list.push(unquote(item[1]));
      data[key] = list;
      continue;
    }
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (pair) {
      key = pair[1];
      list = null;
      data[key] = unquote(pair[2]);
      continue;
    }
    // folded continuation of the previous scalar
    if (key && typeof data[key] === 'string' && /^\s+\S/.test(line)) {
      data[key] = `${data[key]} ${line.trim()}`.trim();
    }
  }
  return { data, body };
}

const entries = [];
const seen = new Set();
const perCollection = {};

for (const collection of COLLECTIONS) {
  const root = join(HOME, collection.dir);
  let count = 0;
  for (const file of walk(root).sort()) {
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    // Normalise CRLF before anything reads it: JS regex `.` excludes \r, so a
    // CRLF file silently parses as having no front matter at all. The hash below
    // therefore describes the normalised text this catalog actually ships.
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!text.trim()) continue;
    const { data, body } = parseFrontmatter(text);
    const name = String(data.name ?? '').trim();
    const description = String(data.description ?? '').trim();
    if (!name || !description) continue; // no invented metadata
    const id = `${collection.slug}/${slugify(name)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const upstreamPath = relative(join(HOME, collection.dir), file).split(sep).join('/');
    const tags = Array.isArray(data.tags) ? data.tags.map(String).slice(0, 8) : [];
    for (const extra of [data.domain, data.subdomain]) {
      if (typeof extra === 'string' && extra && !tags.includes(extra)) tags.push(extra);
    }

    entries.push({
      id,
      name,
      description: description.slice(0, 400),
      collection: collection.slug,
      collectionTitle: collection.title,
      repo: collection.repo,
      license: collection.license,
      publisher: collection.publisher,
      upstreamPath,
      tags,
      bytes: Buffer.byteLength(text, 'utf8'),
      sha256: sha256(text),
      body: text,
      bodyLines: body.split('\n').filter((line) => line.trim()).length,
    });
    count += 1;
  }
  perCollection[collection.slug] = { ...collection, count };
  if (count === 0) console.warn(`  ! ${collection.slug}: 0 skills found under ${root}`);
}

entries.sort((a, b) => a.id.localeCompare(b.id));

// Hash-shard so shard sizes stay even regardless of collection size.
const shardOf = (id) => parseInt(sha256(id).slice(0, 8), 16) % SHARD_COUNT;
const shards = Array.from({ length: SHARD_COUNT }, () => ({}));
const index = [];
for (const entry of entries) {
  const shard = shardOf(entry.id);
  const { body, ...meta } = entry;
  shards[shard][entry.id] = { ...meta, content: body };
  // The index is fetched whole on first search, so it carries only what ranking
  // and rendering need. Full description, repo, license and body live in the
  // shard, which is fetched only for a skill someone actually opens.
  index.push({
    i: entry.id,
    n: entry.name,
    d: entry.description.length > 180 ? `${entry.description.slice(0, 179)}…` : entry.description,
    c: entry.collection,
    t: entry.tags,
    s: shard,
  });
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'shards'), { recursive: true });

const shardHashes = [];
shards.forEach((bucket, i) => {
  const name = String(i).padStart(2, '0');
  const json = JSON.stringify({ shard: i, skills: bucket });
  writeFileSync(join(OUT, 'shards', `${name}.json`), json);
  shardHashes.push({
    shard: i,
    file: `shards/${name}.json`,
    skills: Object.keys(bucket).length,
    bytes: Buffer.byteLength(json),
    sha256: sha256(json),
  });
});

const indexJson = JSON.stringify({ version: 1, shardCount: SHARD_COUNT, skills: index });
writeFileSync(join(OUT, 'index.json'), indexJson);

const manifest = {
  version: 1,
  builtAt: new Date().toISOString(),
  note: 'Third-party Agent Skills redistributed under their own licenses. Cherry did not author these; each entry keeps its upstream repo, license and content hash. Installing one runs Cherry ordinary derivation pipeline over the upstream text.',
  totalSkills: entries.length,
  indexSha256: sha256(indexJson),
  collections: Object.values(perCollection).map(({ dir, ...rest }) => ({ ...rest, sourcePath: dir })),
  shards: shardHashes,
};
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));

const totalBytes = shardHashes.reduce((sum, shard) => sum + shard.bytes, 0);
console.log(`catalog: ${entries.length} skills from ${Object.keys(perCollection).length} collections`);
for (const collection of Object.values(perCollection)) {
  console.log(`  ${String(collection.count).padStart(4)}  ${collection.slug.padEnd(20)} ${collection.license.padEnd(14)} ${collection.repo}`);
}
console.log(`index ${(Buffer.byteLength(indexJson) / 1024).toFixed(0)}KB · shards ${(totalBytes / 1024).toFixed(0)}KB across ${SHARD_COUNT}`);
