import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const tokensPath = resolve(process.cwd(), 'src/design-system/tokens.css');
const tokens = readFileSync(tokensPath, 'utf8');

describe('Apple-inspired design token contract', () => {
  it('keeps the restrained light palette and SF Pro fallbacks', () => {
    expect(tokens).toContain('--color-apple-blue: #0071e3');
    expect(tokens).toContain('--color-link-blue: #0066cc');
    expect(tokens).toContain('--color-signal-blue: #2997ff');
    expect(tokens).toContain('--color-frost: #f5f5f7');
    expect(tokens).toContain('--color-carbon: #1d1d1f');
    expect(tokens).toContain("--font-sf-pro-display: 'SF Pro Display'");
    expect(tokens).toContain("--font-sf-pro-text: 'SF Pro Text'");
  });

  it('uses compact Apple-style shape and type scale tokens', () => {
    expect(tokens).toContain('--radius-cards: 8px');
    expect(tokens).toContain('--radius-inputs: 8px');
    expect(tokens).toContain('--radius-buttons: 980px');
    expect(tokens).toContain('--text-body: 17px');
    expect(tokens).toContain('--text-display: 56px');
  });
});
