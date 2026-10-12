import { describe, expect, it } from 'vitest';
import { dataMartMarkdownLink, mentionAtCursor } from './data-mart-mentions';

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
  it('stores a field name and an escaped alias without losing the Data Mart identity', () => {
    const result = dataMartMarkdownLink(
      { id: 'mart', title: 'Orders' },
      'project',
      'https://app.example',
      { name: 'customer.street & number', alias: 'Street [number]', calculated: true }
    );
    expect(result).toBe(
      '[Orders · Street \\[number\\]](https://app.example/ui/project/data-marts/mart/data-setup?field=customer.street+%26+number)'
    );
  });
});
