import { describe, it, expect } from 'vitest';
import type * as monaco from 'monaco-editor';
import { CHIP_CLASS_NAME, chipDecorationsFor } from './formula-chip-decorations';
import type { ResolvedReference } from './formula-authoring';

function ref(text: string, start: number, path = ''): ResolvedReference {
  return { text, start, end: start + text.length, path, field: text };
}

/** The 1-based line/column quadruple, in the order a range reads. */
const spanOf = (decoration: { range: monaco.IRange }) => [
  decoration.range.startLineNumber,
  decoration.range.startColumn,
  decoration.range.endLineNumber,
  decoration.range.endColumn,
];

describe('chipDecorationsFor', () => {
  it('covers exactly the resolved range and nothing else', () => {
    const decorations = chipDecorationsFor('SUM(clicks)', [ref('clicks', 4)]);

    expect(decorations).toHaveLength(1);
    // `clicks` occupies offsets 4..10, which is columns 5..11 in Monaco's 1-based counting.
    expect(spanOf(decorations[0])).toEqual([1, 5, 1, 11]);
    expect(decorations[0].options.inlineClassName).toBe(CHIP_CLASS_NAME);
  });

  it('draws nothing over text that resolved to no reference', () => {
    expect(chipDecorationsFor('SUM(clicks) / 2', [])).toEqual([]);
  });

  it('draws one chip per reference, in the order they appear', () => {
    const text = 'SUM(clicks) / SUM(impressions)';
    const decorations = chipDecorationsFor(text, [ref('clicks', 4), ref('impressions', 18)]);

    expect(decorations.map(spanOf)).toEqual([
      [1, 5, 1, 11],
      [1, 19, 1, 30],
    ]);
  });

  it('places a chip on the line the reference is on', () => {
    const text = 'SUM(clicks)\n/ SUM(impressions)';
    const decorations = chipDecorationsFor(text, [ref('impressions', 18)]);

    expect(decorations.map(spanOf)).toEqual([[2, 7, 2, 18]]);
  });

  // `references` is the parent's belief about `value`, and the two are a render apart while the
  // analyst types. A span that no longer holds its own text would pill unrelated characters.
  it('skips a reference whose span no longer holds its own text', () => {
    expect(chipDecorationsFor('SUM(clcks)', [ref('clicks', 4)])).toEqual([]);
  });

  it('skips a reference whose span runs past the end of the text', () => {
    expect(chipDecorationsFor('SUM(', [ref('clicks', 4)])).toEqual([]);
  });

  it('skips an empty span rather than drawing a chip over nothing', () => {
    const empty: ResolvedReference = { text: '', start: 4, end: 4, path: '', field: '' };
    expect(chipDecorationsFor('SUM(clicks)', [empty])).toEqual([]);
  });

  // Typing at either edge of a chip must not swallow the new character into the pill: the chip is
  // re-derived a render later, and until then Monaco owns the range.
  it('asks Monaco not to grow the chip when typing at its edges', () => {
    const [decoration] = chipDecorationsFor('SUM(clicks)', [ref('clicks', 4)]);
    // monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
    expect(decoration.options.stickiness).toBe(1);
  });
});
