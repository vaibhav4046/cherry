import { ok, type Result } from '../core/result.ts';
import { invalid } from '../core/errors.ts';
import { ARTIFACT_MEDIA_TYPES } from './artifact-model.ts';

const SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

/**
 * Artifact paths are virtual, relative, forward-slash paths. This validator is
 * also used when importing archives, so traversal and absolute paths must fail
 * here — not in the UI layer.
 */
export function validateArtifactPath(raw: string): Result<{ path: string; extension: string; mediaType: string }> {
  const path = raw.trim();
  if (!path) return invalid('Path is required');
  if (path.length > 512) return invalid('Path is too long');
  if (path.includes('\\')) return invalid('Use forward slashes in artifact paths');
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return invalid('Artifact paths must be relative');
  if (path.includes('\u0000')) return invalid('Path contains a null byte');

  const segments = path.split('/');
  if (segments.length > 12) return invalid('Path is nested too deeply');
  for (const segment of segments) {
    if (segment === '' ) return invalid('Path has an empty segment');
    if (segment === '.' || segment === '..') return invalid('Path traversal segments are not allowed');
    if (!SEGMENT_PATTERN.test(segment)) {
      return invalid(`Path segment "${segment}" contains unsupported characters`);
    }
  }

  const fileName = segments[segments.length - 1]!;
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) return invalid('File needs an extension (e.g. .html, .css, .js, .md, .json)');
  const extension = fileName.slice(dotIndex + 1).toLowerCase();
  const mediaType = ARTIFACT_MEDIA_TYPES[extension];
  if (!mediaType) {
    return invalid(`Extension .${extension} is not supported`, {
      supported: Object.keys(ARTIFACT_MEDIA_TYPES),
    });
  }
  return ok({ path, extension, mediaType });
}
