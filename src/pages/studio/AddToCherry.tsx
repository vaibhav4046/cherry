import { useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BrandIcon } from '../../components/BrandIcons.tsx';

export type AddToCherryPath = 'youtube' | 'article' | 'text' | 'file' | 'history' | 'bookmarklet' | 'channel';

interface AddPath {
  id: AddToCherryPath;
  label: string;
  detail: string;
  destination: string;
  brand?: 'youtube';
}

const ADD_PATHS: readonly AddPath[] = [
  { id: 'youtube', label: 'YouTube link', detail: 'Save an official video link, then add the transcript you choose.', destination: '/studio/quick?add=youtube', brand: 'youtube' },
  { id: 'article', label: 'Article link', detail: 'Save a permitted article or post, with text you paste or fetch on request.', destination: '/studio/quick?add=article' },
  { id: 'text', label: 'Raw text', detail: 'Save text you already have. Cherry keeps where and how it was added.', destination: '/studio/quick?add=text' },
  { id: 'file', label: 'Text file', detail: 'Read a .txt, .md, .srt, or .vtt file in this browser.', destination: '/studio/sources?add=file' },
  { id: 'history', label: 'Watch history', detail: 'Review your local YouTube Takeout and choose which source links to save.', destination: '/studio/sources?add=history', brand: 'youtube' },
  { id: 'bookmarklet', label: 'Save from any tab', detail: 'Install the bookmark, then send the address and title of the page you choose.', destination: '/studio/sources?add=bookmarklet' },
  {
    id: 'channel',
    label: 'Channel watch',
    detail: 'Auto-ingest: your paired runner checks one public YouTube channel on the schedule you approve. New drafts arrive without transcripts; nothing is trusted or approved automatically.',
    destination: '/studio/sources?add=channel',
    brand: 'youtube',
  },
];

export function isAddToCherryPath(value: string | null): value is AddToCherryPath {
  return ADD_PATHS.some((path) => path.id === value);
}

function routeKey(pathname: string): string {
  return (pathname.replace(/\/+$/, '') || '/').toLowerCase();
}

export function AddToCherry({ className = 'btn' }: { className?: string }) {
  const location = useLocation();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const followingLinkRef = useRef(false);

  function close(restoreFocus = true) {
    if (dialogRef.current?.open) dialogRef.current.close();
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className}
        aria-haspopup="dialog"
        data-add-to-cherry-trigger
        onClick={() => dialogRef.current?.showModal()}
      >
        Add to Cherry
      </button>
      <dialog
        ref={dialogRef}
        className="sheet source-dialog"
        aria-labelledby="add-to-cherry-title"
        aria-describedby="add-to-cherry-summary"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={() => {
          if (followingLinkRef.current) followingLinkRef.current = false;
          else window.requestAnimationFrame(() => triggerRef.current?.focus());
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="stack" style={{ gap: 'var(--sp-4)' }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="stack" style={{ gap: 4 }}>
              <span className="label">Choose what you have</span>
              <h2 id="add-to-cherry-title" className="subhead" style={{ margin: 0 }}>Add to Cherry</h2>
            </div>
            <button type="button" className="btn btn-sm" onClick={() => close()} aria-label="Close Add to Cherry">Close</button>
          </div>
          <p id="add-to-cherry-summary" style={{ margin: 0 }}>Outside content stays untrusted until you review it.</p>
          <nav className="stack" aria-label="Ways to add to Cherry" style={{ gap: 'var(--sp-2)', maxHeight: 'min(62vh, 620px)', overflowY: 'auto' }}>
            {ADD_PATHS.map((path) => (
              <Link
                key={path.id}
                to={path.destination}
                replace={routeKey(path.destination.split('?')[0]!) === routeKey(location.pathname)}
                className="source-option"
                onClick={() => {
                  followingLinkRef.current = true;
                  close(false);
                }}
              >
                <span className="row" style={{ gap: 'var(--sp-2)' }}>
                  {path.brand ? <BrandIcon brand={path.brand} size={18} aria-hidden="true" /> : null}
                  <span className="source-option-title">{path.label}</span>
                </span>
                <span className="source-option-copy">{path.detail}</span>
              </Link>
            ))}
          </nav>
        </div>
      </dialog>
    </>
  );
}
