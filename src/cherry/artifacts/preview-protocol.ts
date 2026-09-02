import type { ArtifactFile } from './artifact-model.ts';

/**
 * Static previews intentionally have no sandbox permissions. In particular,
 * scripts, forms, popups, navigation, storage, and same-origin access stay
 * disabled even if an artifact contains markup that asks for them.
 */
export const PREVIEW_SANDBOX = '';

/**
 * The policy is placed before the first byte of artifact content. The data and
 * blob image/font/media sources are local document data, not network origins;
 * every network-capable directive is otherwise closed explicitly.
 */
export const PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "worker-src 'none'",
  "manifest-src 'none'",
  "navigate-to 'none'",
].join('; ');

const RESOURCE_ATTRIBUTES = new Set(['src', 'srcset', 'poster', 'background', 'cite', 'action', 'formaction', 'ping', 'href', 'xlink:href']);
const REMOVED_ELEMENTS = /<(?:iframe|frame|object|embed|portal|form|base|link)\b[^>]*>[\s\S]*?<\/(?:iframe|frame|object|embed|portal|form|base|link)\s*>/gi;
const REMOVED_VOID_ELEMENTS = /<(?:iframe|frame|object|embed|portal|form|base|link)\b[^>]*\/?>/gi;

function sanitizeStylesheet(content: string): string {
  return content
    .replace(/@import\b[^;]*(?:;|$)/gi, '')
    .replace(/url\s*\(\s*(['"]?)(.*?)\1\s*\)/gis, (_match: string, _quote: string, value: string) => (
      /^(?:data:|blob:)/i.test(value.trim()) ? `url("${value}")` : 'none'
    ))
    // Prevent an artifact stylesheet from terminating the trusted style tag.
    .replace(/<\/style/gi, '<\\/style');
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function sanitizeTag(tagName: string, attributes: string): string {
  const safeAttributes = attributes.replace(
    /\s+([a-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/gi,
    (whole: string, rawName: string, doubleQuoted: string | undefined, singleQuoted: string | undefined, bare: string | undefined) => {
      const name = rawName.toLowerCase();
      const value = (doubleQuoted ?? singleQuoted ?? bare ?? '').trim();
      if (name.startsWith('on') || name === 'srcdoc' || name === 'target' || name === 'download') return '';
      if (RESOURCE_ATTRIBUTES.has(name)) {
        // href is removed even for fragment/data links: an artifact preview is
        // static and must not become a navigation surface.
        if (name === 'href' || name === 'xlink:href' || name === 'action' || name === 'formaction' || name === 'ping' || name === 'cite') return '';
        if (!/^(?:data:|blob:)/i.test(value)) return '';
        return ` ${name}="${escapeAttribute(value)}"`;
      }
      if (name === 'style') return ` style="${escapeAttribute(sanitizeStylesheet(value))}"`;
      return whole;
    },
  );
  return `<${tagName}${safeAttributes}>`;
}

function sanitizeHtml(content: string): string {
  let html = content
    // An unclosed script is removed through EOF, fail-closed, rather than
    // allowing any script text to become live markup after transformation.
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[\s\S]*$/gi, '')
    .replace(REMOVED_ELEMENTS, '')
    .replace(REMOVED_VOID_ELEMENTS, '')
    .replace(/<meta\b[^>]*\bhttp-equiv\s*=\s*(['"])refresh\1[^>]*>/gi, '')
    .replace(/<meta\b[^>]*\bhttp-equiv\s*=\s*refresh[^>]*>/gi, '');

  html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (_match: string, styles: string) => `<style>${sanitizeStylesheet(styles)}</style>`);
  return html.replace(/<([a-z][\w:-]*)([^>]*)>/gi, (_match: string, tagName: string, attributes: string) => sanitizeTag(tagName, attributes));
}

function normalizeRef(entryPath: string, ref: string): string {
  const clean = ref.split('?')[0]!.split('#')[0]!;
  if (/^[a-z]+:/i.test(clean) || clean.startsWith('//')) return clean;
  const baseSegments = entryPath.split('/').slice(0, -1);
  const refSegments = clean.split('/');
  const output = [...baseSegments];
  for (const segment of refSegments) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') output.pop();
    else output.push(segment);
  }
  return output.join('/');
}

/**
 * Builds a static, self-contained srcdoc. Only sibling CSS files are inlined;
 * all executable code and resource/navigation references are discarded.
 */
export function buildPreviewDocument(entry: ArtifactFile, files: ArtifactFile[]): string {
  const byPath = new Map(files.map((file) => [file.path, file] as const));
  const html = entry.content
    .replace(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi, (_match: string, href: string) => {
      const target = byPath.get(normalizeRef(entry.path, href));
      return target?.mediaType === 'text/css' ? `<style>${sanitizeStylesheet(target.content)}</style>` : '';
    });

  // The first bytes are trusted policy bytes. No artifact content, including a
  // doctype or an attacker-controlled head element, precedes this meta tag.
  return `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">${sanitizeHtml(html)}`;
}
