import { describe, expect, it } from 'vitest';
import { buildPreviewDocument, PREVIEW_CSP, PREVIEW_SANDBOX } from '../../src/cherry/artifacts/preview-protocol.ts';
import type { ArtifactFile } from '../../src/cherry/artifacts/artifact-model.ts';

function artifact(path: string, content: string, mediaType: ArtifactFile['mediaType']): ArtifactFile {
  return {
    id: path,
    workspaceId: 'workspace-1',
    artifactSetId: 'artifact-set-1',
    path,
    mediaType,
    content,
    sizeBytes: content.length,
    sha256: 'a'.repeat(64),
    revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'human',
  };
}

describe('static artifact previews', () => {
  it('starts with CSP, strips execution and navigation, and keeps only safe inline CSS', () => {
    const entry = artifact('index.html', [
      '<!doctype html><html><head>',
      '<link rel="stylesheet" href="styles/site.css">',
      '<link rel="stylesheet" href="https://evil.example/evil.css">',
      '</head><body onload="fetch(\'https://evil.example\')">',
      '<a href="https://evil.example">leave</a>',
      '<img src="https://evil.example/tracker.gif">',
      '<script>document.body.textContent = "executed";</script>',
      '<button onclick="alert(1)">safe text</button>',
      '</body></html>',
    ].join(''), 'text/html');
    const css = artifact('styles/site.css', '.card { color: red; background: url("https://evil.example/pixel"); }', 'text/css');

    const document = buildPreviewDocument(entry, [entry, css]);

    expect(document.startsWith(`<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`)).toBe(true);
    expect(document).not.toMatch(/<script\b/i);
    expect(document).not.toMatch(/\bon[a-z]+\s*=/i);
    expect(document).not.toContain('evil.example');
    expect(document).toContain('<style>');
    expect(document).toContain('color: red');
    expect(document).not.toContain('url(');
  });

  it('uses an entirely inert iframe sandbox', () => {
    expect(PREVIEW_SANDBOX).toBe('');
    expect(PREVIEW_CSP).toContain("script-src 'none'");
    expect(PREVIEW_CSP).toContain("default-src 'none'");
    expect(PREVIEW_CSP).toContain("navigate-to 'none'");
  });
});
