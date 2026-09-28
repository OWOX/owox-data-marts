import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * SchemaTable pins its separators to the `border-border-on-muted` utility, which exists only while
 * `@owox/ui`'s stylesheet declares the `--border-on-muted` token in both themes and maps it in
 * `@theme inline`. Nothing else connects the two: jsdom compiles no CSS, so a component test sees
 * the class name whether or not it resolves to anything, and Tailwind drops an unknown utility
 * from the build silently. Renaming or dropping the token in `packages/ui` would therefore ship
 * the invisible-separator bug back with a green suite — this file is the guard on that boundary.
 *
 * It runs in the WEB suite on purpose: CI runs `@owox/web` for any change under `packages/**` as
 * well as `apps/web/**` (see .github/workflows/test-owox.yml), so a drift from either side fails
 * here. `@owox/ui` itself has no test runner.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
// tables → DataMartSchemaSettings → components → edit → data-marts → features → src → web → apps,
// landing on the repository root.
const GLOBALS_CSS = resolve(
  HERE,
  '../../../../../../../../..',
  'packages/ui/src/styles/globals.css'
);

/** The declarations of one top-level CSS block, e.g. everything between `:root {` and its `}`. */
function blockOf(css: string, selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  if (start === -1) throw new Error(`no "${selector}" block in globals.css`);
  const end = css.indexOf('\n}', start);
  return css.slice(start, end);
}

describe('the border-on-muted token SchemaTable relies on', () => {
  const css = readFileSync(GLOBALS_CSS, 'utf-8');

  it('is declared for the light theme, as the ordinary border', () => {
    expect(blockOf(css, ':root')).toMatch(/^\s*--border-on-muted:\s*var\(--border\);/m);
  });

  it('is declared for the dark theme, lighter than the muted surface it sits on', () => {
    // `--border` equals `--muted` in the dark theme; the token must not collapse back onto either.
    const dark = blockOf(css, '.dark');
    const declaration = /^\s*--border-on-muted:\s*(.+);/m.exec(dark);
    expect(declaration).not.toBeNull();
    expect(declaration?.[1]).not.toMatch(/var\(--(border|muted)\)/);
    expect(declaration?.[1]).toMatch(/^oklch\(1 0 0 \/ \d+%\)$/);
  });

  it('is exposed to Tailwind as the `border-border-on-muted` utility', () => {
    expect(blockOf(css, '@theme inline')).toMatch(
      /^\s*--color-border-on-muted:\s*var\(--border-on-muted\);/m
    );
  });
});
