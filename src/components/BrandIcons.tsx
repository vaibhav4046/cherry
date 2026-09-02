import type { SVGProps } from 'react';

type Brand = 'slack' | 'teams' | 'discord' | 'telegram' | 'github' | 'youtube';

const paths: Record<Brand, string> = {
  slack: 'M7.2 14.8a2.2 2.2 0 1 1-2.2-2.2h2.2v2.2Zm1.1 0a2.2 2.2 0 0 1 4.4 0v5.5a2.2 2.2 0 1 1-4.4 0v-5.5Zm0-1.1a2.2 2.2 0 1 1 0-4.4h2.2v4.4H8.3Zm0-5.5a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 2.2 2.2v2.2H8.3Zm3.3 0a2.2 2.2 0 1 1 4.4 0v2.2h-4.4V8.2Zm4.4 0a2.2 2.2 0 1 1 4.4 0 2.2 2.2 0 0 1-2.2 2.2H16V8.2Zm0 3.3h2.2a2.2 2.2 0 1 1 0 4.4H16v-4.4Zm-1.1 4.4a2.2 2.2 0 1 1-4.4 0v-2.2h4.4v2.2Z',
  teams: 'M12 6.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Zm5.8 2.1a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4ZM4.4 8.4h15.2v9.5c0 1.4-1.1 2.5-2.5 2.5H6.9a2.5 2.5 0 0 1-2.5-2.5V8.4Zm-4.4 1.2h3.2v7.2H0V9.6Zm7-7.1h10.1v3H7v-3Zm4.3 8.2v7.1h3V10.7h-3Z',
  discord: 'M5.2 5.8A16 16 0 0 1 9.1 4l.5 1.1a14 14 0 0 1 4.8 0L14.9 4a16 16 0 0 1 3.9 1.8c2.1 3.2 3.1 6.3 2.8 9.4a16 16 0 0 1-4.7 2.4l-1.2-1.6c.7-.2 1.3-.5 1.9-.9l-.5-.4a9.6 9.6 0 0 1-9.8 0l-.5.4c.6.4 1.2.7 1.9.9l-1.2 1.6a16 16 0 0 1-4.7-2.4c-.3-3.1.7-6.2 2.8-9.4ZM8.7 14c.8 0 1.4-.8 1.4-1.8s-.6-1.8-1.4-1.8-1.4.8-1.4 1.8.6 1.8 1.4 1.8Zm6.6 0c.8 0 1.4-.8 1.4-1.8s-.6-1.8-1.4-1.8-1.4.8-1.4 1.8.6 1.8 1.4 1.8Z',
  telegram: 'M21.7 3.2 18.3 20c-.3 1.2-1 1.5-2 .9l-5.5-4.1-2.7 2.6c-.3.3-.5.5-1 .5l.4-5.6 10.2-9.2c.4-.4-.1-.6-.6-.2L4.5 13.1l-3.3-1.1c-1.2-.4-1.2-1.2.2-1.8L20 2.2c1-.4 1.9.2 1.7 1Z',
  github: 'M12 1.2a10.8 10.8 0 0 0-3.4 21c.5.1.7-.2.7-.5v-2c-2.9.6-3.5-1.2-3.5-1.2-.5-1.2-1.2-1.5-1.2-1.5-1-.7.1-.7.1-.7 1.1.1 1.7 1.1 1.7 1.1 1 .1.7 1.8 2.9 1.3.1-.7.4-1.2.7-1.5-2.3-.3-4.7-1.1-4.7-5.1 0-1.1.4-2 1.1-2.7-.1-.3-.5-1.3.1-2.7 0 0 .9-.3 2.8 1a9.6 9.6 0 0 1 5.1 0c1.9-1.3 2.8-1 2.8-1 .6 1.4.2 2.4.1 2.7.7.7 1.1 1.6 1.1 2.7 0 4-2.4 4.8-4.7 5.1.4.3.7 1 .7 2v3c0 .3.2.6.7.5A10.8 10.8 0 0 0 12 1.2Z',
  youtube: 'M21.6 7.2a2.8 2.8 0 0 0-2-2C17.8 4.7 12 4.7 12 4.7s-5.8 0-7.6.5a2.8 2.8 0 0 0-2 2A29 29 0 0 0 1.9 12a29 29 0 0 0 .5 4.8 2.8 2.8 0 0 0 2 2c1.8.5 7.6.5 7.6.5s5.8 0 7.6-.5a2.8 2.8 0 0 0 2-2 29 29 0 0 0 .5-4.8 29 29 0 0 0-.5-4.8ZM10 15.4V8.6l6 3.4-6 3.4Z',
};

/** Primary brand colors so the marks read as themselves, not as monochrome glyphs. */
const colors: Record<Brand, string> = {
  slack: '#4a154b',
  teams: '#6264a7',
  discord: '#5865f2',
  telegram: '#26a5e4',
  github: '#24292f',
  youtube: '#ff0000',
};

const labels: Record<Brand, string> = { slack: 'Slack', teams: 'Microsoft Teams', discord: 'Discord', telegram: 'Telegram', github: 'GitHub', youtube: 'YouTube' };

type BrandIconProps = { brand: Brand; size?: number; colored?: boolean } & Omit<SVGProps<SVGSVGElement>, 'aria-label'>;

export function BrandIcon({ brand, size = 22, colored = true, ...props }: BrandIconProps) {
  // A decorative mark (next to its own text label) must not also announce itself.
  const isHidden = props['aria-hidden'] === true || props['aria-hidden'] === 'true';
  return (
    <svg
      {...props}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={isHidden ? undefined : 'img'}
      aria-label={isHidden ? undefined : `${labels[brand]} icon`}
      fill={colored ? colors[brand] : 'currentColor'}
      focusable="false"
    >
      <path d={paths[brand]} />
    </svg>
  );
}

export function BrandMark({ brand, className }: { brand: Brand; className?: string }) {
  return <span className={className ?? 'brand-mark'}><BrandIcon brand={brand} aria-hidden="true" /><span>{labels[brand]}</span></span>;
}

export type { Brand };
