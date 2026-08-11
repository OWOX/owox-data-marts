import { MarkdownParser } from './markdown-parser.service';

describe('MarkdownParser.parseToFragment', () => {
  const parser = new MarkdownParser();

  it('renders a GFM pipe table into a <table>', async () => {
    const md = ['| Node | Endpoint |', '|---|---|', '| price | /v3/price |'].join('\n');
    const html = await parser.parseToFragment(md);
    expect(html).toContain('<table>');
    expect(html).toContain('<th>Node</th>');
    expect(html).toContain('<td>price</td>');
  });

  it('renders **bold** and `code` inline', async () => {
    const html = await parser.parseToFragment('Added **simple_price** via `/v3/price`.');
    expect(html).toContain('<strong>simple_price</strong>');
    expect(html).toContain('<code>/v3/price</code>');
  });

  it('strips script and other unsafe HTML (XSS-safe)', async () => {
    const html = await parser.parseToFragment('<script>alert(1)</script>\n\n**safe**');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<strong>safe</strong>');
  });

  it('strips onerror= from a raw <img> tag (XSS-safe)', async () => {
    const html = await parser.parseToFragment('<img src=x onerror=alert(1)>\n\n**safe**');
    expect(html).not.toContain('onerror');
    expect(html).toContain('<strong>safe</strong>');
  });

  it('strips a javascript: href from a markdown link (XSS-safe)', async () => {
    const html = await parser.parseToFragment('[x](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });

  it('strips a raw <iframe> tag (XSS-safe)', async () => {
    const html = await parser.parseToFragment(
      '<iframe src="https://evil.example"></iframe>\n\n**safe**'
    );
    expect(html).not.toContain('<iframe');
    expect(html).toContain('<strong>safe</strong>');
  });

  it('strips onclick= from a raw <a> tag (XSS-safe)', async () => {
    const html = await parser.parseToFragment(
      '<a href="#" onclick="alert(1)">click me</a>\n\n**safe**'
    );
    expect(html).not.toContain('onclick');
    expect(html).toContain('<strong>safe</strong>');
  });

  it('emits a bare fragment — no <style> block and no inlined style attributes', async () => {
    // The fragment is meant to be styled by the host page; it must NOT carry the
    // GitHub Markdown CSS that parseToHtml inlines (which would leak globally).
    const html = await parser.parseToFragment('# Title\n\nA paragraph.');
    expect(html).not.toContain('<style');
    expect(html).not.toContain('style=');
    expect(html).not.toContain('markdown-body');
  });
});

describe('MarkdownParser.parseToHtml (regression guard)', () => {
  const parser = new MarkdownParser();

  it('still wraps the output in the styled markdown-body container', async () => {
    const html = await parser.parseToHtml('# Title');
    expect(html).toContain('markdown-body');
    // juice inlines the GitHub Markdown CSS as style attributes
    expect(html).toContain('style=');
  });
});
