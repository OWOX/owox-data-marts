import { renderJson } from './output.js';

describe('output', () => {
  it('emits pretty JSON without ANSI color codes', () => {
    const output = renderJson([{ id: 'mart-1', title: 'First Data Mart' }]);

    expect(JSON.parse(output)).toEqual([{ id: 'mart-1', title: 'First Data Mart' }]);
    expect(output).toBe('[\n  {\n    "id": "mart-1",\n    "title": "First Data Mart"\n  }\n]');
    expect(output).not.toContain('\u001B[');
  });
});
