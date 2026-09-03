#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultManifest = join(
  repoRoot,
  'public',
  'media',
  'cherry-chronicle',
  'cherry-chronicle-manifest.json',
);

function parseArguments(argv) {
  const manifestIndex = argv.indexOf('--manifest');
  if (manifestIndex === -1) return { manifestPath: defaultManifest };
  const value = argv[manifestIndex + 1];
  if (!value) throw new Error('--manifest requires a path');
  return { manifestPath: resolve(value) };
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * SVG is text, and a Windows checkout with core.autocrlf=true stores it with CRLF
 * line endings. The manifest records what git stores, so text assets are measured
 * after normalising to LF; binary assets are measured byte for byte.
 */
function canonicalBytes(buffer, filePath) {
  if (!filePath.toLowerCase().endsWith('.svg')) return buffer;
  const text = buffer.toString('utf8');
  const normalized = text.replace(/\r\n/g, '\n');
  return normalized === text ? buffer : Buffer.from(normalized, 'utf8');
}

function requireString(errors, value, label) {
  if (typeof value !== 'string' || value.trim() === '') errors.push(`${label} must be a non-empty string`);
}

function requireHttps(errors, value, label) {
  requireString(errors, value, label);
  if (typeof value === 'string' && !value.startsWith('https://')) errors.push(`${label} must use https`);
}

function safeAssetPath(assetRoot, file, label, errors) {
  requireString(errors, file, label);
  if (typeof file !== 'string' || !file) return null;
  if (isAbsolute(file) || file.includes('\\') || file.split('/').includes('..')) {
    errors.push(`${label} must be a safe forward-slash relative path`);
    return null;
  }
  const resolved = resolve(assetRoot, file);
  const prefix = `${resolve(assetRoot)}${sep}`;
  if (!resolved.startsWith(prefix)) {
    errors.push(`${label} escapes the asset root`);
    return null;
  }
  return resolved;
}

function readPngDimensions(buffer) {
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readWebpDimensions(buffer) {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (chunk === 'VP8 ') {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === 'VP8L') {
    const b1 = buffer[21];
    const b2 = buffer[22];
    const b3 = buffer[23];
    const b4 = buffer[24];
    return {
      width: 1 + b1 + ((b2 & 0x3f) << 8),
      height: 1 + ((b2 & 0xc0) >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10),
    };
  }
  return null;
}

function readJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    if (segmentLength < 2) break;
    offset += segmentLength + 2;
  }
  return null;
}

function readSvgDimensions(buffer) {
  const source = buffer.toString('utf8');
  const tag = source.match(/<svg\b[^>]*>/i)?.[0];
  if (!tag) return null;
  const width = Number(tag.match(/\bwidth="(\d+)"/)?.[1]);
  const height = Number(tag.match(/\bheight="(\d+)"/)?.[1]);
  const viewBox = tag.match(/\bviewBox="0 0 (\d+) (\d+)"/)?.slice(1).map(Number);
  if (!width || !height || !viewBox || viewBox[0] !== width || viewBox[1] !== height) return null;
  return { width, height };
}

function dimensionsFor(buffer, file) {
  const lower = file.toLowerCase();
  if (lower.endsWith('.png')) return readPngDimensions(buffer);
  if (lower.endsWith('.webp')) return readWebpDimensions(buffer);
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return readJpegDimensions(buffer);
  if (lower.endsWith('.svg')) return readSvgDimensions(buffer);
  return null;
}

async function verifyFile({ assetRoot, entry, label, expectedDimensions, maxBytes, declaredFiles, errors }) {
  const filePath = safeAssetPath(assetRoot, entry?.file, `${label}.file`, errors);
  if (!filePath) return null;
  const normalizedFilePath = resolve(filePath);
  const firstDeclaration = declaredFiles.get(normalizedFilePath);
  if (firstDeclaration) {
    errors.push(`${label}.file: duplicate declared file path ${entry.file}; first declared by ${firstDeclaration}`);
  } else {
    declaredFiles.set(normalizedFilePath, `${label}.file`);
  }
  let buffer;
  try {
    buffer = await readFile(filePath);
  } catch {
    errors.push(`${label}: missing file ${entry.file}`);
    return null;
  }
  const canonical = canonicalBytes(buffer, entry.file);
  if (canonical.byteLength !== entry.bytes) errors.push(`${label}: byte-size mismatch for ${entry.file}; manifest=${entry.bytes}, actual=${canonical.byteLength}`);
  const actualHash = sha256(canonical);
  if (actualHash !== entry.sha256) errors.push(`${label}: SHA-256 mismatch for ${entry.file}; manifest=${entry.sha256}, actual=${actualHash}`);
  const dimensions = dimensionsFor(buffer, entry.file);
  if (!dimensions) {
    errors.push(`${label}: unsupported or unreadable image dimensions for ${entry.file}`);
  } else {
    if (dimensions.width !== entry.width || dimensions.height !== entry.height) {
      errors.push(`${label}: dimension mismatch for ${entry.file}; manifest=${entry.width}x${entry.height}, actual=${dimensions.width}x${dimensions.height}`);
    }
    if (expectedDimensions && (dimensions.width !== expectedDimensions.width || dimensions.height !== expectedDimensions.height)) {
      errors.push(`${label}: expected ${expectedDimensions.width}x${expectedDimensions.height}, found ${dimensions.width}x${dimensions.height}`);
    }
  }
  if (Number.isFinite(maxBytes) && buffer.byteLength > maxBytes) errors.push(`${label}: ${entry.file} exceeds ${maxBytes} byte budget`);
  return { filePath, buffer, actualHash };
}

function imageReferences(svg) {
  return [...svg.matchAll(/<image\b[^>]*\bhref="([^"]+)"[^>]*>/gi)].map((match) => match[1]);
}

async function verifySvgSources({ artifact, variant, filePath, buffer, sourceById, assetRoot, errors }) {
  const label = `artifact ${artifact.id}.${variant}`;
  const svg = buffer.toString('utf8');
  if (/<(?:text|foreignObject)\b/i.test(svg)) errors.push(`${label}: visible text is forbidden inside Chronicle artwork`);
  const references = imageReferences(svg);
  if (references.length === 0) errors.push(`${label}: no historical botanical source layer found`);
  const allowedHashes = new Set(
    artifact.sourceIds
      .map((sourceId) => sourceById.get(sourceId)?.derivative?.sha256)
      .filter(Boolean),
  );
  const artifactDir = dirname(filePath);
  for (const reference of references) {
    let imageHash;
    if (reference.startsWith('data:image/')) {
      const payload = reference.match(/^data:image\/(?:png|webp|jpeg);base64,(.+)$/i)?.[1];
      if (!payload) {
        errors.push(`${label}: malformed embedded botanical source`);
        continue;
      }
      imageHash = sha256(Buffer.from(payload, 'base64'));
    } else {
      const linkedPath = resolve(artifactDir, reference);
      const assetPrefix = `${resolve(assetRoot)}${sep}`;
      if (!linkedPath.startsWith(assetPrefix)) {
        errors.push(`${label}: image reference escapes the asset root`);
        continue;
      }
      try {
        imageHash = sha256(await readFile(linkedPath));
      } catch {
        errors.push(`${label}: missing historical source reference ${reference}`);
        continue;
      }
    }
    if (!allowedHashes.has(imageHash)) errors.push(`${label}: botanical source is not one of its declared sourceIds`);
  }
}

async function walkFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

export async function verifyChronicleAssets(manifestPath = defaultManifest) {
  const errors = [];
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    return { ok: false, errors: [`cannot read manifest ${manifestPath}: ${error.message}`] };
  }
  const assetRoot = dirname(manifestPath);
  if (manifest.collection !== 'Cherry Chronicle') errors.push('manifest.collection must be Cherry Chronicle');
  if (manifest.rightsPolicy !== 'public-domain-plus-original-overlay') errors.push('manifest.rightsPolicy must be public-domain-plus-original-overlay');
  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) errors.push('manifest.sources must include at least one public-domain source');
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length < 6 || manifest.artifacts.length > 7) errors.push('manifest.artifacts must contain six or seven artifacts');
  if (manifest?.constraints?.artifactCount !== manifest?.artifacts?.length) errors.push('constraints.artifactCount must equal the artifact count');

  const sourceById = new Map();
  const declaredFiles = new Map();
  for (const [index, source] of (manifest.sources ?? []).entries()) {
    const label = `source[${index}]`;
    requireString(errors, source.id, `${label}.id`);
    if (sourceById.has(source.id)) errors.push(`${label}.id must be unique`);
    sourceById.set(source.id, source);
    requireString(errors, source.title, `${label}.title`);
    requireString(errors, source.creator, `${label}.creator`);
    requireString(errors, source.date, `${label}.date`);
    requireHttps(errors, source.sourcePage, `${label}.sourcePage`);
    requireHttps(errors, source.originalFile, `${label}.originalFile`);
    requireHttps(errors, source?.rights?.url, `${label}.rights.url`);
    requireString(errors, source?.rights?.basis, `${label}.rights.basis`);
    if (!/public domain|cc0/i.test(source?.rights?.status ?? '')) errors.push(`${label}.rights.status must establish public-domain status`);
    await verifyFile({ assetRoot, entry: source.derivative, label: `${label}.derivative`, declaredFiles, errors });
  }

  const artifactIds = new Set();
  let variantCount = 0;
  for (const [index, artifact] of (manifest.artifacts ?? []).entries()) {
    const label = `artifact[${index}]`;
    requireString(errors, artifact.id, `${label}.id`);
    if (artifactIds.has(artifact.id)) errors.push(`${label}.id must be unique`);
    artifactIds.add(artifact.id);
    requireString(errors, artifact.motif, `${label}.motif`);
    requireString(errors, artifact.feature, `${label}.feature`);
    requireString(errors, artifact.originalOverlay, `${label}.originalOverlay`);
    if (!Array.isArray(artifact.sourceIds) || artifact.sourceIds.length === 0) errors.push(`${label}.sourceIds must identify at least one source`);
    for (const sourceId of artifact.sourceIds ?? []) if (!sourceById.has(sourceId)) errors.push(`${label}.sourceIds contains unknown source ${sourceId}`);
    for (const variant of ['desktop', 'mobile']) {
      const constraint = manifest?.constraints?.[variant];
      const verified = await verifyFile({
        assetRoot,
        entry: artifact?.variants?.[variant],
        label: `${label}.${variant}`,
        expectedDimensions: constraint,
        maxBytes: constraint?.maxBytes,
        declaredFiles,
        errors,
      });
      if (verified) {
        variantCount += 1;
        await verifySvgSources({ artifact, variant, ...verified, sourceById, assetRoot, errors });
      }
    }
  }

  const manifestAbsolute = resolve(manifestPath);
  const actualFiles = (await walkFiles(assetRoot)).map((file) => resolve(file)).filter((file) => file !== manifestAbsolute);
  for (const file of actualFiles) {
    if (!declaredFiles.has(file)) errors.push(`unmanifested shipped file: ${relative(assetRoot, file).split(sep).join('/')}`);
  }
  for (const file of declaredFiles.keys()) {
    try {
      if (!(await stat(file)).isFile()) errors.push(`manifest entry is not a regular file: ${relative(assetRoot, file)}`);
    } catch {
      // Missing-file diagnostics are already emitted by verifyFile.
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    artifactCount: manifest.artifacts?.length ?? 0,
    variantCount,
    sourceCount: manifest.sources?.length ?? 0,
  };
}

async function main() {
  const { manifestPath } = parseArguments(process.argv.slice(2));
  const result = await verifyChronicleAssets(manifestPath);
  if (!result.ok) {
    for (const error of result.errors) console.error(`ERROR ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Verified ${result.artifactCount} Chronicle artifacts, ${result.variantCount} responsive variants, and ${result.sourceCount} public-domain sources.`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
