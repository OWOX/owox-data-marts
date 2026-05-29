import { renderJson } from './output.js';

describe('output', () => {
  it('--format json emits valid JSON', () => {
    const output = renderJson([{ id: 'mart-1', title: 'First Data Mart' }]);

    expect(JSON.parse(output)).toEqual([{ id: 'mart-1', title: 'First Data Mart' }]);
    expect(output).not.toContain('\u001B[');
  });
});
