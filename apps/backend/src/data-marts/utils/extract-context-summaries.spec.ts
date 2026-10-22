import { extractContextSummaries } from './extract-context-summaries';

describe('extractContextSummaries', () => {
  it('returns id, name and icon of each loaded context', () => {
    expect(
      extractContextSummaries([
        { context: { id: 'ctx-1', name: 'Marketing', icon: 'lucide:megaphone' } },
        { context: { id: 'ctx-2', name: 'Finance', icon: null } },
        { context: { id: 'ctx-3', name: 'Sales' } },
      ])
    ).toEqual([
      { id: 'ctx-1', name: 'Marketing', icon: 'lucide:megaphone' },
      { id: 'ctx-2', name: 'Finance', icon: null },
      { id: 'ctx-3', name: 'Sales', icon: null },
    ]);
  });

  it('skips links whose context was not loaded', () => {
    expect(extractContextSummaries([{}, { context: { id: 'ctx-1', name: 'Marketing' } }])).toEqual([
      { id: 'ctx-1', name: 'Marketing', icon: null },
    ]);
    expect(extractContextSummaries(undefined)).toEqual([]);
  });
});
