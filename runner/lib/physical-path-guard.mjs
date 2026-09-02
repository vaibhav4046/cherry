/**
 * PhysicalPathGuard owns runner filesystem containment. Lexical containment is
 * necessary but insufficient: every existing segment is lstat'd and resolved
 * physically so symlinks and Windows junctions are refused. Callers re-run the
 * guard immediately before each read, write, copy, or recursive delete.
 */
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, parse, relative, resolve, sep } from 'node:path';

const CASE_INSENSITIVE = process.platform === 'win32';

function comparable(path) {
  const value = resolve(path);
  return CASE_INSENSITIVE ? value.toLowerCase() : value;
}

function within(candidate, root) {
  const target = comparable(candidate);
  const base = comparable(root);
  return target === base || target.startsWith(base + sep);
}

function segmentsTo(path) {
  const absolute = resolve(path);
  const drive = parse(absolute).root;
  const parts = relative(drive, absolute).split(sep).filter(Boolean);
  const paths = [drive];
  let cursor = drive;
  for (const part of parts) {
    cursor = join(cursor, part);
    paths.push(cursor);
  }
  return paths;
}

export class PhysicalPathError extends Error {
  constructor(code, message, path) {
    super(message);
    this.name = 'PhysicalPathError';
    this.code = code;
    this.path = path;
  }
}

function segmentsFrom(root, path) {
  if (!root) return segmentsTo(path);
  const base = resolve(root);
  const target = resolve(path);
  const parts = relative(base, target).split(sep).filter(Boolean);
  const paths = [base];
  let cursor = base;
  for (const part of parts) {
    cursor = join(cursor, part);
    paths.push(cursor);
  }
  return paths;
}

function assertExistingSegments(path, root = null) {
  for (const segment of segmentsFrom(root, path)) {
    if (!existsSync(segment)) break;
    const info = lstatSync(segment);
    if (info.isSymbolicLink()) {
      throw new PhysicalPathError('symlinked_path', `refusing path with a symbolic link or junction segment: ${segment}`, segment);
    }
  }
}

function assertTreeNoLinks(path, root = null) {
  assertExistingSegments(path, root);
  if (!existsSync(path)) return;
  const info = lstatSync(path);
  if (info.isSymbolicLink()) throw new PhysicalPathError('symlinked_path', `refusing symbolic link or junction: ${path}`, path);
  if (!info.isDirectory()) return;
  for (const entry of readdirSync(path)) assertTreeNoLinks(join(path, entry), path);
}

export class PhysicalPathGuard {
  constructor(allowedRoots) {
    if (!Array.isArray(allowedRoots) || allowedRoots.length === 0) throw new Error('PhysicalPathGuard requires allowed roots');
    this.allowedRoots = allowedRoots.map((root) => resolve(root));
    for (const root of this.allowedRoots) {
      if (!existsSync(root) || !statSync(root).isDirectory()) {
        throw new PhysicalPathError('missing_path', `approved root is not an existing directory: ${root}`, root);
      }
      assertExistingSegments(root);
    }
  }

  approvedRootFor(candidate) {
    const target = resolve(candidate);
    const root = this.allowedRoots.find((allowed) => within(target, allowed));
    if (!root) throw new PhysicalPathError('outside_root', `path is outside approved roots: ${target}`, target);
    const info = lstatSync(root);
    if (info.isSymbolicLink()) throw new PhysicalPathError('symlinked_path', `approved root is a symbolic link or junction: ${root}`, root);
    return root;
  }

  assertPath(candidate, { root = null, mustExist = false, type = null, scanTree = false } = {}) {
    const target = resolve(candidate);
    const approved = root ? resolve(root) : this.approvedRootFor(target);
    this.approvedRootFor(approved);
    if (!within(target, approved)) throw new PhysicalPathError('outside_root', `path escapes approved root ${approved}: ${target}`, target);
    assertExistingSegments(target, approved);
    if (mustExist && !existsSync(target)) throw new PhysicalPathError('missing_path', `path does not exist: ${target}`, target);
    if (existsSync(target) && type) {
      const info = lstatSync(target);
      if (type === 'file' && !info.isFile()) throw new PhysicalPathError('wrong_type', `path is not a file: ${target}`, target);
      if (type === 'directory' && !info.isDirectory()) throw new PhysicalPathError('wrong_type', `path is not a directory: ${target}`, target);
    }
    if (scanTree) assertTreeNoLinks(target, approved);
    return target;
  }

  inside(root, relativePath, options = {}) {
    if (typeof relativePath !== 'string' || relativePath.length === 0) {
      throw new PhysicalPathError('invalid_path', 'a non-empty relative path is required', String(relativePath));
    }
    const base = this.assertPath(root, { mustExist: true, type: 'directory' });
    const target = resolve(join(base, relativePath));
    if (!within(target, base)) throw new PhysicalPathError('outside_root', `path escapes its sandbox root: ${relativePath}`, target);
    return this.assertPath(target, { root: base, ...options });
  }

  ensureDirectory(path, { root = null } = {}) {
    const target = this.assertPath(path, { root });
    mkdirSync(target, { recursive: true });
    return this.assertPath(target, { root, mustExist: true, type: 'directory' });
  }

  writeInside(root, relativePath, content) {
    const target = this.inside(root, relativePath);
    this.ensureDirectory(dirname(target), { root });
    this.inside(root, relativePath);
    writeFileSync(target, content);
    this.inside(root, relativePath, { mustExist: true, type: 'file' });
    return target;
  }

  readInside(root, relativePath) {
    const target = this.inside(root, relativePath, { mustExist: true, type: 'file' });
    return readFileSync(target);
  }

  copy(sourceRoot, sourceRelative, destinationRoot, destinationRelative) {
    const source = this.inside(sourceRoot, sourceRelative, { mustExist: true, type: 'file' });
    const destination = this.inside(destinationRoot, destinationRelative);
    this.ensureDirectory(dirname(destination), { root: destinationRoot });
    this.inside(sourceRoot, sourceRelative, { mustExist: true, type: 'file' });
    this.inside(destinationRoot, destinationRelative);
    copyFileSync(source, destination);
    this.inside(destinationRoot, destinationRelative, { mustExist: true, type: 'file' });
    return destination;
  }

  removeTree(path, { root } = {}) {
    const target = this.assertPath(path, { root, mustExist: true, scanTree: true });
    this.assertPath(target, { root, mustExist: true, scanTree: true });
    rmSync(target, { recursive: true });
  }
}

export function createPhysicalPathGuard(allowedRoots) {
  return new PhysicalPathGuard(allowedRoots);
}
