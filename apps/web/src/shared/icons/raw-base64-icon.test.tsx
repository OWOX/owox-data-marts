import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RawBase64Icon } from './raw-base64-icon';

describe('RawBase64Icon', () => {
  it('renders the image when a base64 value is provided', () => {
    const { container } = render(<RawBase64Icon base64='data:image/png;base64,AAAA' />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,AAAA');
  });

  it('renders a fallback icon (no <img>) when base64 is null', () => {
    const { container } = render(<RawBase64Icon base64={null} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders a fallback icon when base64 is an empty/whitespace string', () => {
    const { container } = render(<RawBase64Icon base64='   ' />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders the image for the other MIME types the build inlines', () => {
    for (const src of [
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      'data:image/jpeg;base64,/9j+',
    ]) {
      const { container } = render(<RawBase64Icon base64={src} />);
      expect(container.querySelector('img')?.getAttribute('src')).toBe(src);
    }
  });

  it('trims surrounding whitespace and renders the trimmed value', () => {
    const { container } = render(<RawBase64Icon base64='  data:image/png;base64,AAAA  ' />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA');
  });

  // A connector logo is an editor-authored string that renders on every surface listing
  // connectors. A remote URL there would make each of those surfaces fetch the author's
  // host, handing over every viewer's IP, user agent and timing — so nothing that can
  // reach the network is ever put in `src`.
  it.each([
    ['an https URL', 'https://attacker.example/pixel.png'],
    ['an http URL', 'http://attacker.example/pixel.png'],
    ['a protocol-relative URL', '//attacker.example/pixel.png'],
    ['a relative path', '/api/track/pixel.png'],
    ['a non-image data URI', 'data:text/html;base64,PGh0bWw+PC9odG1sPg=='],
    ['a non-base64 image data URI', 'data:image/svg+xml,<svg/>'],
    ['a data URI with an empty payload', 'data:image/png;base64,'],
    ['a blob URL', 'blob:https://attacker.example/9d1f'],
    ['a javascript URL', 'javascript:void(0)'],
  ])('renders a fallback icon (no <img>) for %s', (_label, value) => {
    const { container } = render(<RawBase64Icon base64={value} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
