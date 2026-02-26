import { HelperOptions } from 'handlebars';
import { ValueTagHandler } from './value-tag.handler';

describe('ValueTagHandler', () => {
  const handler = new ValueTagHandler();

  const context = {
    tableSources: {
      source_value: {
        dataHeaders: [{ name: 'country' }, { name: 'revenue' }],
        dataRows: [
          ['US', 100],
          ['CA', 200],
        ],
      },
      source_table: {
        dataHeaders: [{ name: 'country' }, { name: 'revenue' }],
        dataRows: [
          ['US', 100],
          ['CA', 200],
        ],
      },
    },
  };

  const createOptions = (hash: Record<string, unknown>): HelperOptions =>
    ({ hash }) as unknown as HelperOptions;

  it('renders single value by path syntax', () => {
    const payload = handler.buildPayload(
      [],
      createOptions({ source: 'source_value', path: '.revenue[2]' }),
      context
    );

    const result = handler.handle(payload);

    expect(result.rendered).toBe('200');
  });

  it('renders first row and first column by default', () => {
    const payload = handler.buildPayload([], createOptions({ source: 'source_value' }), context);

    const result = handler.handle(payload);

    expect(result.rendered).toBe('US');
  });

  it('allows reading from any source without kind restriction', () => {
    const payload = handler.buildPayload([], createOptions({ source: 'source_table' }), context);

    const result = handler.handle(payload);

    expect(result.rendered).toBe('US');
  });

  it('returns caution block when path is combined with column/row', () => {
    const payload = handler.buildPayload(
      [],
      createOptions({
        source: 'source_value',
        path: '.revenue[1]',
        column: '2',
      }),
      context
    );

    const result = handler.handle(payload);

    expect(result.rendered).toContain('[!CAUTION]');
    expect(result.rendered).toContain('cannot be combined');
  });
});
