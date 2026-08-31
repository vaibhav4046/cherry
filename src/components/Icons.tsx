import type { ReactNode } from 'react';

function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      {children}
    </svg>
  );
}

/** Sticker-weight icon set. currentColor strokes so nav states restyle them. */
export const Icons = {
  command: (size?: number) => (
    <Icon size={size}><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></Icon>
  ),
  agent: (size?: number) => (
    <Icon size={size}><rect x="4" y="7" width="16" height="12" rx="3" /><circle cx="9" cy="13" r="1.4" fill="currentColor" stroke="none" /><circle cx="15" cy="13" r="1.4" fill="currentColor" stroke="none" /><path d="M12 7V4" /><circle cx="12" cy="3" r="1" fill="currentColor" stroke="none" /></Icon>
  ),
  skills: (size?: number) => (
    <Icon size={size}><circle cx="6" cy="6" r="2.6" /><circle cx="18" cy="6" r="2.6" /><circle cx="12" cy="18" r="2.6" /><path d="M7.8 7.8L10.5 16M16.2 7.8L13.5 16M8.6 6h6.8" /></Icon>
  ),
  memory: (size?: number) => (
    <Icon size={size}><path d="M12 4a4 4 0 0 0-4 4v1a3.5 3.5 0 0 0-1 6.4V17a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3v-1.6A3.5 3.5 0 0 0 16 9V8a4 4 0 0 0-4-4z" /><path d="M12 4v16" /></Icon>
  ),
  runs: (size?: number) => (
    <Icon size={size}><polygon points="7,4 20,12 7,20" /></Icon>
  ),
  proof: (size?: number) => (
    <Icon size={size}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></Icon>
  ),
  connect: (size?: number) => (
    <Icon size={size}><path d="M9 12a4 4 0 0 1 4-4h2a4 4 0 0 1 0 8h-1" /><path d="M15 12a4 4 0 0 1-4 4H9a4 4 0 0 1 0-8h1" /></Icon>
  ),
  quick: (size?: number) => (
    <Icon size={size}><polygon points="13,2 5,14 11,14 10,22 19,9 13,9" /></Icon>
  ),
  watch: (size?: number) => (
    <Icon size={size}><rect x="3" y="5" width="18" height="14" rx="3" /><polygon points="10,9 16,12 10,15" fill="currentColor" stroke="none" /></Icon>
  ),
  download: (size?: number) => (
    <Icon size={size}><path d="M12 4v11" /><path d="M7 11l5 5 5-5" /><path d="M4 20h16" /></Icon>
  ),
  copy: (size?: number) => (
    <Icon size={size}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></Icon>
  ),
  check: (size?: number) => (
    <Icon size={size}><path d="M4 13l5 5L20 7" /></Icon>
  ),
  approve: (size?: number) => (
    <Icon size={size}><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></Icon>
  ),
  pin: (size?: number) => (
    <Icon size={size}><path d="M8 3h8l-1 6 3 3v2h-5v7l-1 1-1-1v-7H6v-2l3-3-1-6Z" /></Icon>
  ),
};

/** Copy-to-clipboard button used by the connect/install panels. */
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={(event) => {
        const target = event.currentTarget;
        void navigator.clipboard
          .writeText(text)
          .then(() => {
            const original = target.textContent;
            target.textContent = 'Copied!';
            window.setTimeout(() => {
              target.textContent = original;
            }, 1400);
          })
          .catch(() => {
            // Clipboard blocked: leave the command selectable for manual copy.
          });
      }}
    >
      {Icons.copy(14)} {label}
    </button>
  );
}
