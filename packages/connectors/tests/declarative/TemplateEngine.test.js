import assert from 'node:assert';
import { describe, it } from 'node:test';
import { TemplateEngine } from '../../src/Core/Declarative/TemplateEngine.js';

describe('TemplateEngine', () => {
  const engine = new TemplateEngine();

  it('substitutes a single whitelisted scope variable', () => {
    const out = engine.render('Bearer {{ auth.token }}', { auth: { token: 'abc' } });
    assert.strictEqual(out, 'Bearer abc');
  });

  it('substitutes multiple variables and nested paths', () => {
    const out = engine.render('{{ parameters.base }}/{{ dateWindow.start }}', {
      parameters: { base: 'USD' },
      dateWindow: { start: '2026-01-01' },
    });
    assert.strictEqual(out, 'USD/2026-01-01');
  });

  it('tolerates surrounding whitespace inside the braces', () => {
    const out = engine.render('{{account.id}}-{{   account.id   }}', { account: { id: '7' } });
    assert.strictEqual(out, '7-7');
  });

  it('throws on a non-whitelisted scope', () => {
    assert.throws(() => engine.render('{{ process.env }}', {}), /scope "process" is not allowed/);
  });

  it('throws on a missing value in an allowed scope', () => {
    assert.throws(
      () => engine.render('{{ parameters.missing }}', { parameters: {} }),
      /unresolved/
    );
  });

  it('returns non-string inputs unchanged', () => {
    assert.strictEqual(engine.render(42, {}), 42);
    assert.strictEqual(engine.render(null, {}), null);
  });

  it('rejects __proto__ traversal (prototype pollution guard)', () => {
    assert.throws(
      () => engine.render('{{ parameters.__proto__ }}', { parameters: {} }),
      /unsafe|not allowed/
    );
  });

  it('rejects constructor and prototype segments', () => {
    assert.throws(
      () => engine.render('{{ parameters.constructor }}', { parameters: {} }),
      /unsafe|not allowed/
    );
    assert.throws(
      () => engine.render('{{ account.prototype }}', { account: {} }),
      /unsafe|not allowed/
    );
  });

  it('resolves a value from the record scope', () => {
    const engine = new TemplateEngine();
    assert.strictEqual(engine.render('{{ record.name }}', { record: { name: 'Ann' } }), 'Ann');
  });

  it('strict mode (default) throws on an unresolved path', () => {
    const engine = new TemplateEngine();
    assert.throws(() => engine.render('{{ record.missing }}', { record: {} }), /unresolved/);
  });

  it('lenient mode renders an unresolved path as an empty string', () => {
    const engine = new TemplateEngine();
    assert.strictEqual(
      engine.render('{{ record.missing }}', { record: {} }, { lenient: true }),
      ''
    );
  });

  it('lenient mode still enforces the scope whitelist', () => {
    const engine = new TemplateEngine();
    assert.throws(() => engine.render('{{ evil.x }}', {}, { lenient: true }), /not allowed/);
  });

  it('resolves a value from the stream_slice scope', () => {
    const engine = new TemplateEngine();
    assert.strictEqual(
      engine.render('{{ stream_slice.campaign_id }}', { stream_slice: { campaign_id: 'A' } }),
      'A'
    );
  });

  it('renderOptional returns undefined when a placeholder is unresolved', () => {
    const scope = { parameters: { Present: 'yes' } };

    assert.strictEqual(engine.renderOptional('{{ parameters.Missing }}', scope), undefined);
    assert.strictEqual(engine.renderOptional('{{ parameters.Present }}', scope), 'yes');
  });

  it('renderOptional treats a partially unresolved template as unresolved', () => {
    const scope = { parameters: { Present: 'yes' } };

    assert.strictEqual(
      engine.renderOptional('{{ parameters.Present }}-{{ parameters.Missing }}', scope),
      undefined
    );
  });

  it('renderOptional reports a legitimately empty resolved value as empty, not absent', () => {
    // renderOptional answers only "did it resolve?"; the send-or-omit policy
    // lives in Requester._renderOptionalMap, which drops '' as well.
    assert.strictEqual(
      engine.renderOptional('{{ parameters.Blank }}', { parameters: { Blank: '' } }),
      ''
    );
  });

  it('renderOptional still throws on a disallowed scope', () => {
    assert.throws(() => engine.renderOptional('{{ evil.path }}', {}), /not allowed/);
  });
});
