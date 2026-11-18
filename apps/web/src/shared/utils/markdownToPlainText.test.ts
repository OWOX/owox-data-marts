import { describe, expect, it } from 'vitest';
import { dataMartMarkdownLink } from '../components/DescriptionEditor/data-mart-mentions';
import { markdownToPlainText } from './markdownToPlainText';

describe('markdownToPlainText', () => {
  it('turns a context description into one line', () => {
    expect(
      markdownToPlainText(
        '## Mission\nCollect cash on time and in line with plan.\n**Owner:** Finance (Olga Kucher) · [Fact. Product ARR. Daily](https://app.owox.com/ui/p1/data-marts/d1/data-setup)'
      )
    ).toBe(
      'Mission: Collect cash on time and in line with plan. Owner: Finance (Olga Kucher) · Fact. Product ARR. Daily'
    );
  });
  it('reads Windows line ends', () => {
    expect(markdownToPlainText('## Goals\r\n---\r\n- one\r\n- two')).toBe('Goals: one two');
  });
  it('keeps the label of a link with an emoji', () => {
    expect(markdownToPlainText('[🥈 Fact. Product ARR](https://x.test/a)')).toBe(
      '🥈 Fact. Product ARR'
    );
  });
  it('keeps the label of an escaped mention', () => {
    const link = dataMartMarkdownLink(
      { id: 'd1', title: 'MQL [activated] _goal_' },
      'p1',
      'https://app.example',
      { name: 'street_number', alias: 'Street [number]', calculated: false }
    );
    expect(markdownToPlainText(`See ${link}.`)).toBe(
      'See MQL [activated] _goal_ · Street [number].'
    );
  });
  it('keeps the alt text of an image', () => {
    expect(markdownToPlainText('![Funnel chart](https://x.test/f.png) above')).toBe(
      'Funnel chart above'
    );
  });
  it('removes emphasis and inline code marks', () => {
    expect(markdownToPlainText('**bold** __bold__ *it* _it_ ~~gone~~ `code`')).toBe(
      'bold bold it it gone code'
    );
  });
  it('removes italics around a phrase', () => {
    expect(markdownToPlainText('Track *net revenue retention* and _gross margin_.')).toBe(
      'Track net revenue retention and gross margin.'
    );
  });
  it('keeps underscores inside words and lone asterisks', () => {
    expect(markdownToPlainText('Sum revenue_usd and cost_per_click, 2 * 3')).toBe(
      'Sum revenue_usd and cost_per_click, 2 * 3'
    );
  });
  it('removes quote, list, task and heading markers', () => {
    expect(
      markdownToPlainText('> ## Note\n- one\n* two\n+ three\n1. four\n- [ ] five\n- [x] six')
    ).toBe('Note: one two three four five six');
  });
  it('keeps a heading that ends in punctuation as it is', () => {
    expect(markdownToPlainText('# Why?\nBecause.')).toBe('Why? Because.');
  });
  it('removes code fences and keeps the code', () => {
    expect(markdownToPlainText('```sql\nSELECT 1\n```')).toBe('SELECT 1');
  });
  it('flattens a table', () => {
    expect(markdownToPlainText('| KPI | Owner |\n| --- | :---: |\n| ARR | Finance |')).toBe(
      'KPI Owner ARR Finance'
    );
  });
  it('unescapes Markdown escapes', () => {
    expect(markdownToPlainText('5 \\* 3 \\_x\\_ \\# tag')).toBe('5 * 3 _x_ # tag');
  });
  it('returns an empty string for syntax only', () => {
    expect(markdownToPlainText('---\n\n##\n***')).toBe('');
  });
  it('caps a very long input', () => {
    const start = performance.now();
    expect(markdownToPlainText('_a '.repeat(20000)).length).toBeLessThanOrEqual(2000);
    expect(performance.now() - start).toBeLessThan(500);
  });
  it('keeps double underscores inside names', () => {
    expect(markdownToPlainText('See stg_hubspot__deals and Amount__c, not __bold__')).toBe(
      'See stg_hubspot__deals and Amount__c, not bold'
    );
  });
  it('unescapes any ASCII punctuation', () => {
    expect(markdownToPlainText('Costs \\$5 \\& more \\@ team')).toBe('Costs $5 & more @ team');
  });
  it('keeps a pipe outside a table', () => {
    expect(
      markdownToPlainText('Main source: [GA4 | Sessions](https://x.test/a)\nOwner: A | Backup: B')
    ).toBe('Main source: GA4 | Sessions Owner: A | Backup: B');
  });
  it('flattens a quoted table, fence and rule', () => {
    expect(
      markdownToPlainText(
        '> | KPI | Target |\n> | --- | --- |\n> | ARR | 10 |\n> ---\n> ```sql\n> SELECT 1\n> ```'
      )
    ).toBe('KPI Target ARR 10 SELECT 1');
  });
  it('keeps the number of a numbered heading', () => {
    expect(markdownToPlainText('## 1. Mission\nCollect cash.')).toBe('1. Mission: Collect cash.');
  });
  it('removes closing heading hashes', () => {
    expect(markdownToPlainText('## Mission ##\nCollect cash.')).toBe('Mission: Collect cash.');
  });
  it('does not double the colon of a formatted heading', () => {
    expect(markdownToPlainText('## **Goals:**\nGrow ARR.')).toBe('Goals: Grow ARR.');
    expect(markdownToPlainText('## *Why it matters?*\nRetention.')).toBe(
      'Why it matters? Retention.'
    );
    expect(markdownToPlainText('## Done\\.\nNext')).toBe('Done. Next');
  });
  it('removes a GitHub alert marker', () => {
    expect(markdownToPlainText('> [!WARNING]\n> Revenue excludes refunds.')).toBe(
      'Revenue excludes refunds.'
    );
  });
  it('reads a hard line break', () => {
    expect(markdownToPlainText('Owner: A\\\nBackup: B')).toBe('Owner: A Backup: B');
  });
  it('removes ~~~ fences and other rules', () => {
    expect(markdownToPlainText('~~~\nSELECT 1\n~~~\nA\n___\nB\n- - -\nC')).toBe('SELECT 1 A B C');
  });
  it('treats a lone carriage return as a line break', () => {
    expect(markdownToPlainText('## Goals\r- one\r- two')).toBe('Goals: one two');
  });
  it('removes the colon of a heading at the very end', () => {
    expect(markdownToPlainText('## Notes')).toBe('Notes');
    expect(markdownToPlainText('Contacts:')).toBe('Contacts:');
    expect(markdownToPlainText('# Done.\nA')).toBe('Done. A');
    expect(markdownToPlainText('# Wow!\nA')).toBe('Wow! A');
    expect(markdownToPlainText('# Note:\nA')).toBe('Note: A');
  });
  it('removes a link and emphasis that span lines', () => {
    expect(
      markdownToPlainText('[Fact. Product\nARR](https://x.test/a) and **Owner:\nFinance**')
    ).toBe('Fact. Product ARR and Owner: Finance');
  });
  it('keeps the text of inline code as it is', () => {
    expect(markdownToPlainText('Read `dataset.__TABLES__` and `2**10`')).toBe(
      'Read dataset.__TABLES__ and 2**10'
    );
  });
  it('removes a setext heading underline', () => {
    expect(markdownToPlainText('Mission\n===\nCollect cash.')).toBe('Mission Collect cash.');
  });
  it('reads a line of blanks around a rule fast', () => {
    const start = performance.now();
    expect(markdownToPlainText(`${' '.repeat(665)}---${' '.repeat(1331)}x`)).toBe('--- x');
    expect(performance.now() - start).toBeLessThan(500);
  });
});
