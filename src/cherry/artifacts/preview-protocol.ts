import type { ArtifactFile } from './artifact-model.ts';

/**
 * The preview iframe is sandboxed (no same-origin, no popups, no forms, no
 * top-navigation) and carries a CSP that blocks all network egress. Artifact
 * assets are inlined into one srcdoc document so no request ever leaves it.
 */
export const PREVIEW_SANDBOX = 'allow-scripts';

export const PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

const RUNTIME_BRIDGE = `<script>
(function () {
  'use strict';
  function post(kind, message, detail) {
    try {
      parent.postMessage({ __cherryPreview: true, kind: kind, message: String(message).slice(0, 2000), detail: detail ? String(detail).slice(0, 4000) : undefined, at: new Date().toISOString() }, '*');
    } catch (e) { /* parent gone */ }
  }
  window.addEventListener('error', function (event) {
    post('error', event.message || 'Script error', (event.filename || '') + ':' + (event.lineno || 0));
  });
  window.addEventListener('unhandledrejection', function (event) {
    post('error', 'Unhandled promise rejection: ' + (event.reason && event.reason.message ? event.reason.message : event.reason));
  });
  var originalError = console.error;
  console.error = function () {
    post('log', Array.prototype.map.call(arguments, String).join(' '));
    return originalError.apply(console, arguments);
  };
  window.addEventListener('DOMContentLoaded', function () { post('ready', 'preview loaded'); });
})();
</script>`;

function escapeForInline(content: string): string {
  return content.replace(/<\/(script)/gi, '<\\/$1');
}

/**
 * Builds a self-contained srcdoc from the artifact set: CSS <link> and JS
 * <script src> references to sibling artifact files are inlined; everything
 * else stays untouched. The CSP meta tag and runtime bridge are prepended.
 */
export function buildPreviewDocument(entry: ArtifactFile, files: ArtifactFile[]): string {
  const byPath = new Map(files.map((file) => [file.path, file] as const));
  let html = entry.content;

  html = html.replace(
    /<link[^>]*href=["']([^"']+)["'][^>]*>/gi,
    (_match, href: string) => {
      const target = byPath.get(normalizeRef(entry.path, href));
      if (target && target.mediaType === 'text/css') {
        return `<style>\n${escapeForInline(target.content)}\n</style>`;
      }
      // External references are removed: the sandbox blocks them anyway.
      return `<!-- external link removed by Cherry preview: ${href.slice(0, 120)} -->`;
    },
  );

  html = html.replace(
    /<script([^>]*)src=["']([^"']+)["']([^>]*)>\s*<\/script>/gi,
    (_match, _pre: string, src: string) => {
      const target = byPath.get(normalizeRef(entry.path, src));
      if (target && (target.mediaType === 'text/javascript' || target.path.endsWith('.js'))) {
        return `<script>\n${escapeForInline(target.content)}\n</script>`;
      }
      return `<!-- external script removed by Cherry preview: ${src.slice(0, 120)} -->`;
    },
  );

  const head = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">${RUNTIME_BRIDGE}`;
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (match) => `${match}${head}`);
  } else if (/<html[^>]*>/i.test(html)) {
    html = html.replace(/<html[^>]*>/i, (match) => `${match}<head>${head}</head>`);
  } else {
    html = `<head>${head}</head>${html}`;
  }
  return html;
}

function normalizeRef(entryPath: string, ref: string): string {
  const clean = ref.split('?')[0]!.split('#')[0]!;
  if (/^[a-z]+:/i.test(clean) || clean.startsWith('//')) return clean; // external, never matches
  const baseSegments = entryPath.split('/').slice(0, -1);
  const refSegments = clean.split('/');
  const output = [...baseSegments];
  for (const segment of refSegments) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      output.pop();
    } else {
      output.push(segment);
    }
  }
  return output.join('/');
}

export interface PreviewMessage {
  kind: 'error' | 'log' | 'ready';
  message: string;
  detail?: string;
  at: string;
}

/** Validates a window message from the preview iframe. */
export function parsePreviewMessage(data: unknown): PreviewMessage | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  if (record['__cherryPreview'] !== true) return null;
  const kind = record['kind'];
  if (kind !== 'error' && kind !== 'log' && kind !== 'ready') return null;
  const message = typeof record['message'] === 'string' ? record['message'].slice(0, 2000) : '';
  const result: PreviewMessage = {
    kind,
    message,
    at: typeof record['at'] === 'string' ? record['at'] : new Date().toISOString(),
  };
  if (typeof record['detail'] === 'string') result.detail = record['detail'].slice(0, 4000);
  return result;
}
