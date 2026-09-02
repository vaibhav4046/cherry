import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const verifier = join(repoRoot, 'scripts', 'verify-cherry-chronicle-assets.mjs');
const repositoryManifest = join(
  repoRoot,
  'public',
  'media',
  'cherry-chronicle',
  'cherry-chronicle-manifest.json',
);

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function runVerifier(manifest) {
  return spawnSync(process.execPath, [verifier, '--manifest', manifest], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

async function writeFixture() {
  const root = await mkdtemp(join(tmpdir(), 'cherry-chronicle-assets-'));
  const assetRoot = join(root, 'public', 'media', 'cherry-chronicle');
  const sourceDir = join(assetRoot, 'sources');
  const artifactDir = join(assetRoot, 'artifacts');
  await mkdir(sourceDir, { recursive: true });
  await mkdir(artifactDir, { recursive: true });

  const source = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n7sAAAAASUVORK5CYII=',
    'base64',
  );
  const sourceFile = 'sources/source.png';
  await writeFile(join(assetRoot, sourceFile), source);

  const artifacts = [];
  for (let index = 1; index <= 6; index += 1) {
    const variants = {};
    for (const [variant, width, height] of [
      ['desktop', 1600, 1000],
      ['mobile', 780, 1040],
    ]) {
      const file = `artifacts/fixture-${index}-${variant}.svg`;
      const svg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><image href="../sources/source.png" width="1" height="1"/><path d="M0 0L1 1" stroke="#641c37"/></svg>`,
      );
      await writeFile(join(assetRoot, file), svg);
      variants[variant] = {
        file,
        width,
        height,
        bytes: svg.byteLength,
        sha256: sha256(svg),
      };
    }
    artifacts.push({
      id: `fixture-${index}`,
      motif: 'seed',
      feature: 'fixture contract',
      sourceIds: ['fixture-source'],
      originalOverlay: 'One original line connecting two verified points.',
      variants,
    });
  }

  const manifest = {
    version: '1.0.0',
    collection: 'Cherry Chronicle',
    rightsPolicy: 'public-domain-plus-original-overlay',
    constraints: {
      artifactCount: 6,
      desktop: { width: 1600, height: 1000, maxBytes: 350000 },
      mobile: { width: 780, height: 1040, maxBytes: 300000 },
    },
    sources: [
      {
        id: 'fixture-source',
        title: 'Fixture source',
        creator: 'Test suite',
        date: '2026',
        sourcePage: 'https://example.invalid/source',
        originalFile: 'https://example.invalid/source.png',
        rights: {
          status: 'public domain',
          basis: 'Fixture declaration for isolated verifier tests.',
          url: 'https://creativecommons.org/publicdomain/mark/1.0/',
        },
        derivative: {
          file: sourceFile,
          width: 1,
          height: 1,
          bytes: source.byteLength,
          sha256: sha256(source),
        },
      },
    ],
    artifacts,
  };
  const manifestPath = join(assetRoot, 'cherry-chronicle-manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { root, manifestPath, assetRoot, manifest };
}

test('the repository Chronicle pack satisfies the responsive, provenance, and integrity contract', () => {
  const result = runVerifier(repositoryManifest);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /verified 7 Chronicle artifacts, 14 responsive variants, and 3 public-domain sources/i);
});

test('the verifier rejects hash drift and missing responsive variants', async (t) => {
  const fixture = await writeFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const clean = runVerifier(fixture.manifestPath);
  assert.equal(clean.status, 0, `${clean.stdout}\n${clean.stderr}`);

  const drifted = join(fixture.assetRoot, fixture.manifest.artifacts[0].variants.desktop.file);
  const original = await readFile(drifted);
  await writeFile(drifted, Buffer.concat([original, Buffer.from('\n<!-- tampered -->\n')]));
  const drift = runVerifier(fixture.manifestPath);
  assert.notEqual(drift.status, 0);
  assert.match(`${drift.stdout}\n${drift.stderr}`, /sha-256 mismatch/i);

  await writeFile(drifted, original);
  const missing = join(fixture.assetRoot, fixture.manifest.artifacts[1].variants.mobile.file);
  await unlink(missing);
  const absent = runVerifier(fixture.manifestPath);
  assert.notEqual(absent.status, 0);
  assert.match(`${absent.stdout}\n${absent.stderr}`, /missing file/i);
});

test('the verifier rejects visible text embedded in Chronicle artwork', async (t) => {
  const fixture = await writeFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const target = join(fixture.assetRoot, fixture.manifest.artifacts[0].variants.mobile.file);
  const original = await readFile(target, 'utf8');
  const withText = original.replace('</svg>', '<text x="1" y="1">Ship it</text></svg>');
  await writeFile(target, withText);
  fixture.manifest.artifacts[0].variants.mobile.bytes = Buffer.byteLength(withText);
  fixture.manifest.artifacts[0].variants.mobile.sha256 = sha256(Buffer.from(withText));
  await mkdir(dirname(fixture.manifestPath), { recursive: true });
  await writeFile(fixture.manifestPath, `${JSON.stringify(fixture.manifest, null, 2)}\n`);

  const result = runVerifier(fixture.manifestPath);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /visible text is forbidden/i);
});
