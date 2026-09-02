import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CherryHomeLink } from '../../src/components/CherryHomeLink.tsx';

afterEach(() => cleanup());

describe('Cherry home logo', () => {
  it('uses the canonical Cherry SVG inside an accessible 44px home link', () => {
    render(
      <MemoryRouter>
        <CherryHomeLink />
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: 'Cherry home' });
    const image = link.querySelector('img');

    expect(link.getAttribute('href')).toBe('/');
    expect(link.classList.contains('logo-mark')).toBe(true);
    expect(image?.getAttribute('src')).toBe('/cherry.svg');
    expect(image?.getAttribute('alt')).toBe('');
    expect(image?.getAttribute('width')).toBe('32');
    expect(image?.getAttribute('height')).toBe('32');
  });
});
