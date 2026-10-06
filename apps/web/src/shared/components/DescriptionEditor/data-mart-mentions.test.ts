import { describe, expect, it, vi } from 'vitest';
import type * as Monaco from 'monaco-editor';
import {
  dataMartMarkdownLink,
  mentionAtCursor,
  registerDataMartMentions,
} from './data-mart-mentions';

describe('Data Mart mentions', () => {
  it('finds mentions and preserves surrounding text while excluding emails and inline code', () => {
    expect(mentionAtCursor('Goal: @marketing funnel')).toEqual({
      query: 'marketing funnel',
      start: 6,
    });
    expect(mentionAtCursor('@')).toEqual({ query: '', start: 0 });
    expect(mentionAtCursor('name@example.com')).toBeNull();
    expect(mentionAtCursor('https://example.com/@mart')).toBeNull();
    expect(mentionAtCursor('` @mart')).toBeNull();
    expect(mentionAtCursor('[title @mart]')).toBeNull();
  });
  it('escapes Markdown labels and encodes stable IDs in the current deployment URL', () => {
    expect(
      dataMartMarkdownLink(
        { id: 'mart/id', title: 'MQL [activated] _goal_\nQ4' },
        'project/id',
        'https://demo.example'
      )
    ).toBe(
      '[MQL \\[activated\\] \\_goal\\_ Q4](https://demo.example/ui/project%2Fid/data-marts/mart%2Fid/data-setup)'
    );
  });
  it('only offers mentions in prose outside links and code, using the document prefix', () => {
    for (const prefix of [
      '[See @Revenue',
      '[See\n @Revenue',
      '[See](https://example.com/ @Revenue',
      '```markdown\n@Revenue',
      '~~~\n@Revenue',
      '````\n```\n@Revenue',
      '`` code ` @Revenue',
    ])
      expect(mentionAtCursor(prefix)).toBeNull();
    for (const prefix of [
      '[See](https://example.com/) @Revenue',
      '```\ncode\n```\n@Revenue',
      '~~~\ncode\n~~~~\n@Revenue',
      '`` code ` `` @Revenue',
      '\\[See @Revenue',
      '\\` @Revenue',
    ])
      expect(mentionAtCursor(prefix)?.query).toBe('Revenue');
  });
  function harness(text = 'Goal: @mark', offset = text.length) {
    let provider: Monaco.languages.CompletionItemProvider;
    const dispose = vi.fn();
    const getValueInRange = vi.fn(() => text.slice(0, offset));
    const model = { getValueInRange } as unknown as Monaco.editor.ITextModel;
    const editor = { getModel: () => model } as Monaco.editor.IStandaloneCodeEditor;
    const monaco = {
      languages: {
        CompletionItemKind: { Reference: 17 },
        registerCompletionItemProvider: (
          _language: string,
          value: Monaco.languages.CompletionItemProvider
        ) => {
          provider = value;
          return { dispose };
        },
      },
    } as unknown as typeof Monaco;
    const token = { isCancellationRequested: false } as Monaco.CancellationToken;
    const lines = text.slice(0, offset).split('\n');
    const position = {
      lineNumber: lines.length,
      column: lines.at(-1)!.length + 1,
    } as Monaco.Position;
    return {
      monaco,
      editor,
      model,
      token,
      position,
      dispose,
      getValueInRange,
      invoke: (requestModel = model) =>
        provider.provideCompletionItems(
          requestModel,
          position,
          {} as Monaco.languages.CompletionContext,
          token
        ),
    };
  }
  it('allows mentions in a new paragraph after unmatched inline Markdown', () => {
    for (const text of [
      'range [0, 100)\n\nGoal: @Revenue',
      'a lone ` delimiter\n\nGoal: @Revenue',
      'an unmatched `` span\n \t\nGoal: @Revenue',
      '[See](https://example.com/\r\n\t\r\nGoal: @Revenue',
    ])
      expect(mentionAtCursor(text)).toEqual({
        query: 'Revenue',
        start: text.lastIndexOf('@'),
      });

    for (const text of [
      '[See\nGoal: @Revenue',
      '` code\nGoal: @Revenue',
      '[See](https://example.com/\nGoal: @Revenue',
      '```markdown\nrange [0, 100)\n\n@Revenue',
      '~~~\n\n@Revenue',
    ])
      expect(mentionAtCursor(text)).toBeNull();
  });
  it('offers and replaces a mention after a paragraph boundary', async () => {
    const h = harness('range [0, 100)\n\nGoal: @Revenue');
    const load = vi.fn().mockResolvedValue([{ id: 'revenue', title: 'Revenue' }]);
    registerDataMartMentions(h.monaco, h.editor, 'project', load, vi.fn());
    const result = await h.invoke();
    expect(load).toHaveBeenCalledOnce();
    expect(result?.suggestions).toHaveLength(1);
    expect(result?.suggestions[0]).toMatchObject({
      label: 'Revenue',
      range: { startLineNumber: 3, endLineNumber: 3, startColumn: 7, endColumn: 15 },
    });
  });
  it('searches titles, replaces the whole @query, and stays scoped to its own editor model', async () => {
    const h = harness();
    const load = vi.fn().mockResolvedValue([
      { id: 'marketing', title: 'Marketing Funnel' },
      { id: 'sales', title: 'Sales' },
    ]);
    const registration = registerDataMartMentions(h.monaco, h.editor, 'project', load, vi.fn());
    const result = await h.invoke();
    expect(result?.suggestions).toHaveLength(1);
    expect(result?.suggestions[0]).toMatchObject({
      label: 'Marketing Funnel',
      range: { startColumn: 7, endColumn: 12 },
      insertText: expect.stringContaining('/ui/project/data-marts/marketing/data-setup)'),
    });
    expect(await h.invoke({} as Monaco.editor.ITextModel)).toEqual({ suggestions: [] });
    expect(load).toHaveBeenCalledTimes(1);
    registration.dispose();
    expect(h.dispose).toHaveBeenCalledOnce();
    expect(await h.invoke()).toEqual({ suggestions: [] });
  });
  it('does not load references when the cursor is inside a link label or fenced code', async () => {
    for (const text of ['[See @Revenue](https://example.com)', '```\n@Revenue\n```']) {
      const h = harness(text, text.indexOf('@Revenue') + '@Revenue'.length);
      const load = vi.fn().mockResolvedValue([{ id: 'revenue', title: 'Revenue' }]);
      registerDataMartMentions(h.monaco, h.editor, 'project', load, vi.fn());
      expect(await h.invoke()).toEqual({ suggestions: [] });
      expect(load).not.toHaveBeenCalled();
      expect(h.getValueInRange).toHaveBeenCalledWith({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: h.position.lineNumber,
        endColumn: h.position.column,
      });
    }
  });
  it('replaces only the mention on the current line after a closed code fence', async () => {
    const h = harness('```\ncode\n```\nGoal: @Revenue');
    registerDataMartMentions(
      h.monaco,
      h.editor,
      'project',
      () => Promise.resolve([{ id: 'revenue', title: 'Revenue' }]),
      vi.fn()
    );
    expect((await h.invoke())?.suggestions[0].range).toEqual({
      startLineNumber: 4,
      endLineNumber: 4,
      startColumn: 7,
      endColumn: 15,
    });
  });
  it('discards late results after editor disposal or cancellation and reports load errors', async () => {
    const h = harness();
    let resolve!: (references: { id: string; title: string }[]) => void;
    const load = () =>
      new Promise<{ id: string; title: string }[]>(done => {
        resolve = done;
      });
    const registration = registerDataMartMentions(h.monaco, h.editor, 'p', load, vi.fn());
    const pending = h.invoke();
    registration.dispose();
    resolve([{ id: 'm', title: 'Marketing' }]);
    expect(await pending).toEqual({ suggestions: [] });
    const other = harness();
    const error = vi.fn();
    registerDataMartMentions(
      other.monaco,
      other.editor,
      'p',
      () => Promise.reject(new Error('offline')),
      error
    );
    expect(await other.invoke()).toEqual({ suggestions: [] });
    expect(error).toHaveBeenLastCalledWith(expect.stringContaining('Could not load'));
  });
});
