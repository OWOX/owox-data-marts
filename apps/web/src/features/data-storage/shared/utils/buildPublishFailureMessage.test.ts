import { describe, it, expect } from 'vitest';
import { buildPublishFailureMessage } from './buildPublishFailureMessage';

describe('buildPublishFailureMessage', () => {
  it('states the shared reason when every draft failed the same way', () => {
    expect(buildPublishFailureMessage(2, ['Data Mart has no definition'])).toBe(
      'Failed to publish 2 Data Mart drafts: Data Mart has no definition. ' +
        'Review them in the Data Marts list and try again.'
    );
  });

  it('says "due to different errors" when reasons differ', () => {
    const message = buildPublishFailureMessage(2, [
      'Data Mart has no definition',
      'Publishing failed. Open the Data Mart to see details.',
    ]);

    expect(message).toContain('Failed to publish 2 Data Mart drafts due to different errors.');
  });

  it('uses the singular form for a single draft', () => {
    expect(buildPublishFailureMessage(1, ['Data Mart has no definition'])).toContain(
      'Failed to publish 1 Data Mart draft:'
    );
  });

  it('reports the server count, not the number of distinct reasons', () => {
    expect(buildPublishFailureMessage(11, ['Data Mart has no definition'])).toContain(
      'Failed to publish 11 Data Mart drafts'
    );
  });
});
