import { describe, expect, it } from 'vitest';
import { bookmarkletHref, bookmarkletOrigin, classifyIngestUrl, ingestDraftFromSearch } from '../../src/cherry/source/ingest.ts';

describe('Save to Cherry ingest helpers', () => {
  it('builds the exact production bookmarklet without reading browser state', () => {
    expect(bookmarkletHref('https://cherry-wine.vercel.app')).toBe(
      "javascript:(()=>{window.open('https://cherry-wine.vercel.app/ingest?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'_blank','noopener');})();",
    );
    expect(bookmarkletOrigin('https://getcherry.vercel.app')).toBe('https://cherry-wine.vercel.app');
  });

  it('keeps a supplied localhost origin in the exact bookmarklet', () => {
    expect(bookmarkletHref('http://127.0.0.1:4173/')).toBe(
      "javascript:(()=>{window.open('http://127.0.0.1:4173/ingest?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'_blank','noopener');})();",
    );
    expect(bookmarkletOrigin('http://localhost:5173')).toBe('http://localhost:5173');
    expect(bookmarkletOrigin('http://127.0.0.1:4173')).toBe('http://127.0.0.1:4173');
  });

  it('classifies only official YouTube hosts as YouTube', () => {
    expect([
      'https://youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://studio.youtube.com/video/dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
    ].map(classifyIngestUrl)).toEqual(['youtube', 'youtube', 'youtube', 'youtube']);

    expect([
      'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
      'https://notyoutube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be.evil.example/dQw4w9WgXcQ',
      'https://www.youtu.be/dQw4w9WgXcQ',
      'ftp://youtube.com/watch?v=dQw4w9WgXcQ',
    ].map(classifyIngestUrl)).toEqual(['article', 'article', 'article', 'article', 'article']);
  });

  it('turns text-only query input into a note draft without a permission assertion', () => {
    expect(ingestDraftFromSearch('?title=Review%20loop&text=Check%20the%20evidence.')).toEqual({
      kind: 'note',
      title: 'Review loop',
      url: '',
      text: 'Check the evidence.',
      requiresPermission: false,
    });
  });
});
